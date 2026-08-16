/** Shared test configuration helpers. */
import { loadConfig, type AppConfig } from '../../src/config/env';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasTestDb = TEST_DB_URL.length > 0;

/** Test-only encryption key (64 hex chars = 32 bytes). Never used in production. */
export const TEST_WALLET_KEY = 'aa'.repeat(32);

/** Test-only Telegram token. Never used in production. */
export const TEST_BOT_TOKEN = '123456789:AAHfi5eTestTokenForAutomatedTestsOnly';

export const ADMIN_CHAT_ID = 777000001;

export function makeConfig(overrides: Record<string, string> = {}): AppConfig {
  const env: NodeJS.ProcessEnv = {
    BOT_TOKEN: TEST_BOT_TOKEN,
    ADMIN_CHAT_IDS: String(ADMIN_CHAT_ID),
    SOLANA_NETWORK: 'devnet',
    SOLANA_MAINNET_ENABLED: 'false',
    WALLET_ENCRYPTION_KEY: TEST_WALLET_KEY,
    DATABASE_URL: 'postgres://hfive:hfive@127.0.0.1:5432/hfive',
    DEPOSIT_POLL_INTERVAL_MS: '60000',
    LOG_LEVEL: 'silent',
    ...overrides,
  };
  return loadConfig(env);
}
