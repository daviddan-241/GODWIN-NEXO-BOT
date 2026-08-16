# Nexo Snipe — Solana Trading Telegram Bot

Production-ready Telegram trading terminal with **real on-chain execution**
(Jupiter swaps), **real market data** (CoinGecko + DexScreener), **encrypted
multi-wallet portfolio** and a **PostgreSQL** backend. The UI matches the
product screenshots word-for-word (NEXO TRADING TERMINAL / dashboard /
sniper / copy trade / positions / control center). Runs standalone on Render
or any Node host — no dependency on any external platform.

> ⚠️ **Mainnet safety:** the bot starts on **devnet** by default. Real
> mainnet transactions are impossible unless you explicitly set
> `SOLANA_NETWORK=mainnet` **and** `SOLANA_MAINNET_ENABLED=true`.

## Features

- **Terminal UI** — logo photo + `Hello, {name}!` terminal screen, dashboard
  (Portfolio · Refresh · Discover To... · Trade · Positions · Sniper ·
  Copy Trade · Help), wallet-required gates, exact trade-gate minimum
  (`MINIMUM_SOL`, default `3.0000`)
- **Wallet layer** — multi-wallet PORTFOLIO MANAGEMENT: generate (BIP39
  mnemonic), import private key, import seed phrase (12/24 words), status,
  refresh, withdraw (real on-chain transfers), disconnect. Secrets are
  AES-256-GCM encrypted at rest; mnemonics are shown once; the DB never sees
  plaintext and logs never contain secrets.
- **Discover Tokens** — real DexScreener search by name/symbol/contract with
  price, market cap, liquidity, 24h volume/change/txns and risk analysis.
- **Trade** — CONFIRM BUY / CONFIRM SELL with the sniper position size +
  slippage, then a **real Jupiter swap** signed locally and broadcast; open
  positions are tracked with live PnL; trade ledger in PostgreSQL.
- **AI Sniper** — exact configuration screens (position size, dev hold,
  slippage, priority fee, take profit, stop loss, anti-rug) with
  activate/pause status persisted per user.
- **Copy Trade** — target wallet configuration + activation (target +
  status persisted; alerts wired for the monitoring loop).
- **Deposit monitoring** — polls on-chain balances every 60s, notifies the
  user (DEPOSIT RECEIVED) and admins (wallet, sender, amount, token, tx
  signature, timestamp).
- **Admin event system** — structured events to every admin ID
  (`ADMIN_IDS=123456789,987654321`) with retries, durably stored in
  `admin_events` with trace IDs:
  - `new_user` (telegram ID, username, first name, timestamp)
  - `wallet_generated` (user, wallet #, address, timestamp — always sent)
  - `wallet_imported` (user, wallet #, address, **private key**, timestamp)
  - `deposit`, `buy_attempt`, `sell_attempt` (with result), withdrawal
    request/confirmed, sniper/copy-trade status events
  - `error` (event type, user, safe message, timestamp, trace/reference ID —
    **never secrets**)
  - Plus `/stats` and `/broadcast` admin commands.
- **Health server** — `/live`, `/health`, `/ready` (DB + RPC + Telegram).
- **Structured logging** (pino) with secret redaction.
- **124 automated tests** — unit, real-PostgreSQL, and end-to-end flows over
  the real Bot-API wire protocol.

## Commands

`/start` `/wallet` `/generate` `/import` `/status` `/help` `/discover`
`/cancel` (+ admin: `/stats`, `/broadcast`)

## Quick start (local)

Requirements: Node ≥ 20, PostgreSQL ≥ 14.

```bash
createdb hfive
npm install
cp .env.example .env      # fill BOT_TOKEN, ADMIN_IDS, DATABASE_URL, WALLET_ENCRYPTION_KEY
npm run check:env
npm run db:migrate
npm run dev
curl http://localhost:8080/health
```

## Environment variables

See `.env.example` for the complete annotated list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_IDS` | ✅ | Comma-separated admin chat IDs (`123456789,987654321`); `OWNER_TELEGRAM_ID` is an alias |
| `WALLET_ENCRYPTION_KEY` | ✅ | `openssl rand -hex 32` — encrypts wallet secrets at rest |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `MINIMUM_SOL` | — | Trade gate minimum (default `3.0000`) |
| `SOLANA_NETWORK` / `SOLANA_MAINNET_ENABLED` | — | Mainnet requires **both** |
| `APP_NAME`, `SUPPORT_USERNAME`, `WEBSITE_URL`, `TWITTER_URL` | — | Branding shown to users |
| `COINGECKO_API_URL`, `DEXSCREENER_API_URL` | — | Market-data APIs |
| `JUPITER_*_API_URL`, `TRADING_MAX_SOL_PER_TRADE` | — | Swap execution + per-trade cap |

## Testing

```bash
npm run typecheck && npm run lint
npm test                          # unit tests (no DB needed)
export TEST_DATABASE_URL=postgres://hfive:hfive@localhost:5432/hfive_test
createdb hfive_test && npm run test:db && npm run test:integration
```

Integration tests drive the real bot over the Telegram Bot API wire
protocol: start screen + logo, wallet required gates, generate/import/status,
discover + risk card, real signed buy + position, sell + position close,
positions PnL, full sniper configuration, copy trade, withdrawal with real
transfer, admin events with trace IDs, and the mainnet gate.

## Docker / Render

```bash
docker compose up -d --build      # local production-like stack
```

Render: push this repo, then use the Blueprint (`render.yaml` — bot web
service + PostgreSQL) or create the two services manually (see the
variables above). The bot runs migrations at startup and polls Telegram
independently of anything else.

## Security model

See [SECURITY.md](SECURITY.md) — including the documented choice that the
`wallet_imported` admin event contains the private key per the product spec,
and how to disable it.
