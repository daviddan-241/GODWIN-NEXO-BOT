-- 0002_nexo_admin_events.sql
-- Wallet numbers, per-user wallet counter and the admin event log.

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_counter INTEGER NOT NULL DEFAULT 0;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_number INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS admin_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_events_created ON admin_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_events_type ON admin_events (event_type);
