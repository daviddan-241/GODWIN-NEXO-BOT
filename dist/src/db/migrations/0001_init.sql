-- 0001_init.sql — initial schema for Hfive bot
-- Applied idempotently by src/db/migrate.ts (transactional, recorded in schema_migrations).

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES users(chat_id) ON DELETE CASCADE,
  slippage_bps INTEGER NOT NULL DEFAULT 100,
  buy_amount_sol TEXT NOT NULL DEFAULT '0.1',
  priority_fee_lamports INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT UNIQUE NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  address TEXT UNIQUE NOT NULL,
  encrypted_secret JSONB NOT NULL,
  derivation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  chat_id BIGINT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'idle',
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  input_mint TEXT NOT NULL,
  output_mint TEXT NOT NULL,
  input_amount TEXT NOT NULL,
  output_amount TEXT NOT NULL,
  price_usd TEXT,
  slippage_bps INTEGER NOT NULL,
  tx_signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS deposits (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  amount TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, mint)
);

CREATE INDEX IF NOT EXISTS idx_trades_chat_created ON trades (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_chat_created ON deposits (chat_id, created_at DESC);
