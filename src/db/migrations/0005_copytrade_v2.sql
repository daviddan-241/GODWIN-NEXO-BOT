-- 0005_copytrade_v2.sql
-- Real copy-trade monitoring: signal dedupe + daily exposure accounting.

CREATE TABLE IF NOT EXISTS copytrade_signals (
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  signature TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, signature)
);

ALTER TABLE copy_trade ADD COLUMN IF NOT EXISTS daily_used_sol DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE copy_trade ADD COLUMN IF NOT EXISTS daily_reset_date TEXT NOT NULL DEFAULT '';
