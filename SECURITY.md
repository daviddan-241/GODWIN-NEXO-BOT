# Security Model

Hfive handles wallet private keys for Solana. This document describes exactly
how secrets are protected, what is trusted, and what the residual risks are.

## What is stored where

| Material | Storage | Protection |
|---|---|---|
| Wallet secret (BIP39 mnemonic or raw 32-byte private key) | PostgreSQL `wallets.encrypted_secret` (JSONB) | AES-256-GCM with a scrypt-derived key (`N=2^15`, r=8, p=1, random 32-byte salt per record). Random 12-byte IV per encryption. GCM auth tag prevents tampering; wrong keys fail loudly. |
| `WALLET_ENCRYPTION_KEY` | Host environment only (Render env vars / `.env`) | Never written to the database, never logged, never sent to Telegram. |
| `BOT_TOKEN` | Host environment only | Same as above; pino additionally redacts common secret field names as defense-in-depth. |
| Plaintext keys in memory | Process memory, only inside the call that needs them (`getKeypair`, `exportSecret`) | Not cached, not stored in module state, garbage-collected after use. |

## Trust boundaries

- **The process** is trusted with everything: it must decrypt keys to sign
  transactions (a bot cannot trade otherwise).
- **The database** is treated as untrusted: it only ever sees ciphertext.
  Someone with DB access alone cannot recover keys.
- **The RPC endpoint** receives signed transactions only — never keys.
- **Jupiter** receives quote/swap requests and the bot's **public** address —
  never keys. Transaction signing happens locally.
- **Telegram** receives the bot token (for API calls) and outbound messages;
  the user's own secret is only shown back to that user in their private chat
  after a two-step confirmation warning.

## Server-side signing (unavoidable in this architecture)

A Telegram trading bot must sign transactions server-side; this capability is
deliberately isolated in `src/wallet/`:

- `crypto.ts` — the only place encryption/decryption primitives live.
- `service.ts` — the only place keys are decrypted; every caller gets a
  transient `Keypair` and must not store it.
- `trading/executor.ts` and `wallet/service.ts` (withdrawals) — the only two
  call sites that sign transactions.

Mitigations if the host is compromised: keys exist in memory only; there is no
remote key export endpoint; withdrawal/export flows require explicit user
confirmation; consider a hosted KMS/HSM or per-user offline signing if the
threat model demands stronger isolation.

## Mainnet safety gate

Real mainnet transactions require **both** `SOLANA_NETWORK=mainnet` and
`SOLANA_MAINNET_ENABLED=true`. The single choke point is
`src/trading/safety.ts`, which every trade must pass. Additionally:

- per-trade SOL cap (`TRADING_MAX_SOL_PER_TRADE`),
- slippage bounds (0.1% – 30%),
- minimum trade size (0.001 SOL),
- SOL balance pre-check (fees included),
- sell amounts re-verified against live on-chain balances,
- withdrawals keep a 0.01 SOL fee/rent reserve.

Devnet is the default and the only mode where trading is enabled out of the
box.

## Operational hygiene

1. Generate `WALLET_ENCRYPTION_KEY` with `openssl rand -hex 32`.
2. Never commit `.env`; `.gitignore` excludes it (`.env.example` is the
   template).
3. If the key material must change: export wallets first, replace the key, and
   re-import — blobs are not re-encryptable without the old key (GCM
   authentication will reject decryption).
4. If the database or the host is compromised, consider all wallets whose
   secrets were decrypted on that host as exposed, and rotate them.
5. Restrict the DB port, use TLS for RPC endpoints in production, and prefer a
   private RPC provider for mainnet.

## Admin events and the `wallet_imported` private key

The admin event system sends structured notifications to every configured
admin chat ID and records them in the `admin_events` table. Per the product
spec, the `wallet_imported` event includes the wallet's derived **private
key** in plaintext. This is a deliberate, documented trade-off:

- Only the configured `ADMIN_IDS` receive it (Telegram chats are encrypted in
  transit between Telegram clients and servers; the message is also stored in
  the `admin_events` table and in those admins' Telegram history).
- Error events NEVER contain secrets — they carry only a safe message and a
  trace/reference ID.
- If you do not want keys in admin alerts, remove the `Private key:` line from
  `formatAdminEvent('wallet_imported', …)` in `src/admin/notifier.ts`.

## Log hygiene

Logging never receives secrets. The codebase convention: log public addresses,
chat IDs, signatures, amounts and error messages only. `pino` is configured
with redaction paths for common secret field names (`token`, `secret`,
`privateKey`, `mnemonic`, `DATABASE_URL`, …) as a second layer of defense.
Automated tests assert that a wallet mnemonic never appears in any outbound
message other than the one-time reveal, and that admin/log output contains no
secret material.
