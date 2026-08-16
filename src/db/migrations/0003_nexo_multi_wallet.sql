-- 0003_nexo_multi_wallet.sql
-- Multi-wallet support (screenshot-spec: Portfolio Management with several
-- wallets), sniper settings, positions and copy-trade configuration.

-- Wallets: one user can hold several wallets now.
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_chat_id_key;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_address_key;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'generated';

-- Balance snapshots are now per wallet ADDRESS (multi-wallet safe).
ALTER TABLE balance_snapshots DROP CONSTRAINT IF EXISTS balance_snapshots_pkey;
ALTER TABLE balance_snapshots ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
UPDATE balance_snapshots SET address = '' WHERE address IS NULL;
ALTER TABLE balance_snapshots ADD PRIMARY KEY (chat_id, address, mint);

CREATE TABLE IF NOT EXISTS sniper_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES users(chat_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'STANDBY',
  position_size DOUBLE PRECISION NOT NULL DEFAULT 10,
  max_dev_hold DOUBLE PRECISION NOT NULL DEFAULT 20,
  slippage DOUBLE PRECISION NOT NULL DEFAULT 10,
  priority_fee DOUBLE PRECISION NOT NULL DEFAULT 0.001,
  take_profit DOUBLE PRECISION NOT NULL DEFAULT 100,
  stop_loss DOUBLE PRECISION NOT NULL DEFAULT 30,
  anti_rug BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT NOT NULL,
  amount_sol DOUBLE PRECISION NOT NULL,
  entry_price_usd DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS copy_trade (
  chat_id BIGINT PRIMARY KEY REFERENCES users(chat_id) ON DELETE CASCADE,
  target_wallet TEXT,
  status TEXT NOT NULL DEFAULT 'STANDBY',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_positions_chat ON positions (chat_id, status);
