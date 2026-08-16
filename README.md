# Nexo Snipe — Solana Trading Telegram Bot

Production-ready Telegram bot for trading Solana SPL tokens with **real on-chain
swaps** (Jupiter), **real RPC data**, **encrypted wallets** and a **PostgreSQL**
backend. Designed to run standalone on Render (or any Node host) — it has no
dependency on any external hosting platform.

> ⚠️ **Mainnet safety:** the bot starts on **devnet** by default. Real mainnet
> transactions are impossible unless you explicitly set
> `SOLANA_NETWORK=mainnet` **and** `SOLANA_MAINNET_ENABLED=true`. There is no
> code path that can sign a mainnet transaction without both.

---

## Features

- **Telegram bot layer** (grammY, long polling) with an inline-keyboard menu
- **Conversation/state management** — per-chat FSM persisted in PostgreSQL
  (survives restarts), `/cancel` support, state-aware text input
- **Wallet/security layer** — BIP39 mnemonics (m/44'/501'/0'/0') or raw private
  key import, AES-256-GCM encryption at rest (scrypt key derivation), keys
  decrypted only in-memory at signing time, never logged
- **Solana RPC layer** — balances, SPL token accounts, mint validation, signed
  transaction submission + confirmation (devnet/mainnet endpoints)
- **Market-data layer** — live prices and swap quotes from the public Jupiter
  APIs (real DEX liquidity)
- **Trading layer** — buy/sell any SPL token: quote preview → confirm → real
  swap signed locally and broadcast to the chain; trade ledger in PostgreSQL
- **Portfolio/positions layer** — live balances, USD valuations, average-cost
  P/L per position
- **Deposit monitoring** — polls on-chain balances, records deposits, notifies
  users/admins; re-baselines after trades/withdrawals so internal moves are
  never misclassified
- **Admin event system** — structured events fan out to every configured
  admin chat ID (`ADMIN_IDS=123456789,987654321`) with retries, and are
  durably recorded in the `admin_events` table with a trace/reference ID:
  - `new_user` — Telegram ID, username, first name, timestamp
  - `wallet_generated` — user, wallet number, public address, timestamp
    (always sent)
  - `wallet_imported` — user, wallet number, public address, private key,
    timestamp
  - `deposit` — wallet, sender (if available), amount, token, transaction
    signature (if available), timestamp
  - `buy_attempt` / `sell_attempt` — user, wallet, token, amount, timestamp,
    result
  - `error` — event type, user (if applicable), safe error message,
    timestamp, trace/reference ID. Never includes secrets.
  - Plus `/stats` and `/broadcast` admin commands.
- **HTTP health server** — `/live`, `/health`, `/ready` with DB + RPC +
  Telegram checks
- **Structured logging** (pino) with secret redaction; secrets never logged
- **Automated tests** — 105 tests: unit, real-PostgreSQL repository tests, and
  end-to-end Telegram navigation flows over the real Bot-API wire protocol

## Architecture

```
src/
├── index.ts            # entrypoint: config → db → app → graceful shutdown
├── app.ts              # production dependency wiring
├── config/             # zod-validated environment configuration
├── logging/            # pino logger with secret redaction
├── db/                 # PostgreSQL (drizzle), repos, SQL migrations
├── wallet/             # crypto (AES-256-GCM), BIP39 derivation, service
├── solana/             # RPC client (real Connection)
├── market/             # Jupiter price + swap providers
├── trading/            # executor + safety layer (mainnet gate, caps)
├── portfolio/          # positions + P/L
├── deposits/           # balance snapshots, diff detection, poll loop
├── admin/              # Telegram transport + notifier (retry/backoff)
├── telegram/           # bot wiring, DB sessions, keyboards, handlers
└── health/             # node:http health server
tests/
├── unit/               # config, crypto, derive, safety, formatting, ...
├── db/                 # repositories against real PostgreSQL
├── integration/        # full bot navigation flows (real wiring, mock I/O)
└── helpers/            # test doubles: mock Bot API (HTTP), fake RPC/Jupiter
scripts/                # migrate, db-ping, check-env, build assets
```

All external I/O (Telegram, Solana RPC, Jupiter, admin delivery) sits behind
small interfaces so the entire application logic runs in tests with
protocol-level doubles — nothing is faked in production code.

## Quick start (local development)

Requirements: Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
# 1. Database
createdb hfive            # or: docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=hfive -e POSTGRES_DB=hfive postgres:16

# 2. Install
npm install

# 3. Configure
cp .env.example .env
#   BOT_TOKEN=...                     (from @BotFather)
#   ADMIN_IDS=123456789,987654321     (your admin Telegram chat ids)
#   DATABASE_URL=postgres://...:...@localhost:5432/hfive
#   WALLET_ENCRYPTION_KEY=<openssl rand -hex 32>
#   leave SOLANA_NETWORK=devnet

# 4. Check the environment
npm run check:env

# 5. Migrate + run (dev mode)
npm run db:migrate
npm run dev

# Health check
curl http://localhost:8080/health
```

Send `/start` to your bot. To get devnet SOL for testing, use a devnet faucet
(e.g. `solana airdrop` from the CLI or a public devnet faucet) and deposit it
to the address shown under 📥 Deposit.

## Environment variables

All configuration comes from the environment (`.env` in dev, Render
environment variables in production). See `.env.example` for the full list.

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_IDS` | ✅ | Comma-separated admin chat IDs that receive admin notifications (supports multiple: `123456789,987654321`). `ADMIN_CHAT_IDS` is accepted as an alias. |
| `APP_NAME` | — | Product name shown to users (default: `Nexo Snipe`) |
| `WALLET_ENCRYPTION_KEY` | ✅ | 64-hex-char key (or long passphrase) that encrypts wallet secrets at rest |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SOLANA_NETWORK` | — | `devnet` (default) or `mainnet` |
| `SOLANA_MAINNET_ENABLED` | — | `true`/`false` (default). **Both** it and `SOLANA_NETWORK=mainnet` are required for real mainnet transactions |
| `SOLANA_RPC_URL` | — | Overrides the default public RPC per network (recommended in production) |
| `COMMITMENT` | — | `confirmed` (default) or `finalized` |
| `JUPITER_QUOTE_API_URL` | — | Default `https://quote-api.jup.ag/v6` |
| `JUPITER_PRICE_API_URL` | — | Default `https://api.jup.ag/price/v2` |
| `DEFAULT_SLIPPAGE_BPS` | — | Default user slippage (100 = 1%) |
| `TRADING_MAX_SOL_PER_TRADE` | — | Hard per-trade cap in SOL (default 10) |
| `DEPOSIT_POLL_INTERVAL_MS` | — | Deposit monitor poll interval (default 30000) |
| `PORT` | — | Health server port (default 8080) |
| `LOG_LEVEL` | — | pino level: `fatal…trace, silent` |
| `TELEGRAM_API_ROOT` | — | Advanced override (used by the test suite) |

## Database

Migrations are plain SQL files in `src/db/migrations`, applied in order inside
transactions and recorded in `schema_migrations`. They run automatically at
startup and are idempotent.

```bash
npm run db:migrate   # apply pending migrations
npm run db:ping      # connectivity check
```

## Testing

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # unit tests only (no database needed)
npm run test:unit    # same as above

# Database + integration tests need a real PostgreSQL:
export TEST_DATABASE_URL=postgres://hfive:hfive@localhost:5432/hfive_test
createdb hfive_test  # once
npm run test:db
npm run test:integration
```

What the integration tests verify (real application wiring, protocol-level
doubles for Telegram/RPC/Jupiter): `/start`, wallet create/import/export with
mnemonic hygiene assertions, full buy flow (mint → amount → live quote preview
→ confirm → signed tx → trade ledger), full sell flow, deposit screen, full
withdraw flow, settings, portfolio, admin `/stats`, cancellation, mainnet-gate
enforcement (a trade on "mainnet" without the flag is **blocked and no
transaction is ever sent**), and deposit detection/rebaselining.

## Docker

```bash
cp .env.example .env   # fill in real values
docker compose up -d --build
curl http://localhost:8080/health
```

The image runs as a non-root user, contains only production dependencies, and
runs migrations automatically on startup.

## Deploying on Render

1. Push this repository to GitHub.
2. In Render, create a **PostgreSQL** instance (e.g. "hfive-db") and copy its
   internal connection string.
3. Create a **Web Service** connected to the repo:
   - **Runtime:** Docker
   - **Dockerfile path:** `Dockerfile`
   - **Health check path:** `/health`
4. Add the environment variables listed above. For the database, set
   `DATABASE_URL` to the **internal** connection string from step 2.
5. Deploy. The service runs `node dist/src/index.js`: it waits for the DB,
   applies migrations, verifies the bot token, starts long polling, the
   deposit monitor and the health server.

The bot runs independently of anything else once deployed — it talks directly
to the Telegram Bot API, your PostgreSQL, your Solana RPC endpoint and the
Jupiter APIs.

## Wallet import (`/import`)

`/import` enters the import conversation state, validates the BIP39 seed
phrase (12 or 24 words), derives the Solana keypair, determines the public
address, encrypts and stores the secret, checks the real on-chain SOL balance
and displays the resulting wallet. The plaintext mnemonic is never written to
logs or the database. Admin chat(s) receive a `wallet_imported` event that
includes the derived private key **by product design** — see SECURITY.md for
the implications.

## Security model

See [SECURITY.md](SECURITY.md).

## Limitations & notes

- Token names/symbols are not fetched; users paste mint addresses (validated
  on-chain) and the UI shows short addresses + prices. A token-metadata lookup
  is a planned enhancement.
- P/L uses the average-cost method over the trade ledger.
- The deposit monitor attributes balance increases as deposits; trades and
  withdrawals re-baseline immediately. The first snapshot of a pre-existing
  wallet is a pure baseline (records no deposits).
- One wallet per Telegram user; the bot trades with its own wallet, never the
  user's.
