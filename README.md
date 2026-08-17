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

- **Terminal UI** — logo photo + `👋 Hello, {name}!` terminal screen
  (🟢 NEXO TRADING TERMINAL, MARKET FEED, 🔒 TRADE GATE), persistent main
  keyboard (💼 Portfolio · 🔄 Refresh · 🪙 Discover To… · ⚡ Trade ·
  📊 Positions · 🤖 Sniper · 🐋 Copy Trade · ❓ Help), wallet-required
  gates with 🏠 Dashboard, trade-gate minimum (`MIN_SOL_BALANCE`, default
  `3.0000`) verified against the real RPC balance
- **Wallet layer** — multi-wallet PORTFOLIO / WALLETS: 🟣 Add SOL Wallet N,
  🔑 Import to Wallet…, 🧩 Seed → Wallet N, 📈 Check Status, 🔄 Refresh,
  💸 Withdraw (real on-chain transfers), 🔌 Disconnect (soft, audit-safe),
  per-wallet active state + last balance check. Wallet secrets are
  AES-256-GCM encrypted at rest (ENCRYPTION_KEY); mnemonics shown once;
  the user's seed-phrase message is deleted from the chat after import;
  the DB never sees plaintext and logs never contain secrets.
- **Discover Tokens** — real DexScreener search by name/symbol/contract with
  price, market cap, liquidity, 24h volume/change/txns and risk analysis.
- **Trade** — CONFIRM BUY / CONFIRM SELL with the sniper position size +
  slippage, then a **real Jupiter swap** signed locally and broadcast; open
  positions are tracked with live PnL; trade ledger in PostgreSQL.
- **AI Sniper** — exact configuration screens (position size, dev hold,
  slippage, priority fee, take profit, stop loss, anti-rug) with
  activate/pause status persisted per user.
- **Copy Trade** — explicit configuration before following: target wallet,
  max SOL per trade, max daily exposure, slippage, token filter, Buy+Buy
  / Buy Only mode, enable/disable (all persisted).
- **Deposit monitoring** — polls on-chain balances (SOL + SPL) and
  notifies the user (DEPOSIT RECEIVED) and admins (wallet, sender, amount,
  token, tx signature, slot, timestamp). Notifications fire only after the
  delta persists across `DEPOSIT_CONFIRMATION_POLLS` consecutive polls at
  the configured commitment (anti-reorg), and an optional
  `SOLANA_WS_URL` WebSocket watcher wakes the monitor on account changes.
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
- **Health server** — UptimeRobot-compatible plain `OK` on `GET /` and
  `GET /health`; `/live` and `/ready` (full DB + RPC + Telegram checks);
  `HEALTHCHECK_ENABLED` toggle.
- **Hardening** — per-chat rate limiting, conversation timeouts (stale
  flows reset to idle), HTML-escaped user input, RPC retries with backoff,
  transaction-confirmation handling.
- **Structured logging** (pino) with secret redaction.
- **139 automated tests** — unit, real-PostgreSQL, and end-to-end flows over
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

| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `MIN_SOL_BALANCE` | — | Trade gate minimum (default `3.0000`; `MINIMUM_SOL` alias) |
| `ENCRYPTION_KEY` | ✅ | Encrypts wallet secrets at rest (`openssl rand -hex 32`; `WALLET_ENCRYPTION_KEY` alias) |
| `SEED_PHRASE` | — | Optional owner seed: derived at startup, only the public address is logged |
| `SOLANA_WS_URL` | — | Optional WebSocket endpoint for account-change driven deposit checks |
| `DEPOSIT_CONFIRMATION_POLLS` | — | Consecutive polls a deposit delta must persist before notify (default 2) |
| `HEALTHCHECK_ENABLED` | — | `true`/`false` (default true) |
| `CONVERSATION_TIMEOUT_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | — | Hardening knobs |
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

### Render — fixing an existing service (30 seconds)

If your Render service logs
`Error: Cannot find module '/opt/render/project/src/src/index.js'`, it is
running the **Node (native) runtime** with the old start command. The source
is TypeScript — the compiled entry point lives at `dist/src/index.js`.

Fix in **Render → your service → Settings**:

| Field | Value |
|---|---|
| **Build Command** | `npm ci --include=dev --no-audit && npm run build` |
| **Start Command** | `node dist/src/index.js` |

> `--include=dev` is REQUIRED: Render sets `NODE_ENV=production`, which would
> otherwise skip the TypeScript compiler and produce no build output.
> Optionally add env var `NODE_VERSION=22`.

### Render — fresh deployment (Docker Blueprint)

Render → **New + → Blueprint** → connect GitHub → select this repo.
`render.yaml` provisions a PostgreSQL database + a Docker web service (the
Dockerfile compiles TypeScript in a build stage, no build commands needed).
Set `BOT_TOKEN`, `ADMIN_IDS`, `ENCRYPTION_KEY` on the service
(`DATABASE_URL` is wired automatically). Migrations run at startup and
`/health` returns `OK`.

### Free-tier notes

- Free services sleep after ~15 min idle — a free UptimeRobot monitor on
  `https://<service>.onrender.com/health` every 5 min keeps it awake.
- Render's free PostgreSQL expires after ~30 days; for longer runs use a
  free Neon/Supabase Postgres and paste its connection string as
  `DATABASE_URL`.

## Security model

See [SECURITY.md](SECURITY.md) — including the documented choice that the
`wallet_imported` admin event contains the private key per the product spec,
and how to disable it.
