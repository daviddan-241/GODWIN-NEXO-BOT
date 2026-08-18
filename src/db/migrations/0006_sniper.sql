-- 0006_sniper.sql
-- Real AI Sniper: mark sniper-originated positions and persist scanned mints.

ALTER TABLE positions ADD COLUMN IF NOT EXISTS sniper BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sniper_seen (
  chat_id BIGINT NOT NULL REFERENCES users(chat_id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, mint)
);
