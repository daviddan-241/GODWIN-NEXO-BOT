/**
 * Hfive — Solana trading Telegram bot. Production entrypoint.
 *
 * 1. Load & validate environment configuration (fail fast).
 * 2. Connect to PostgreSQL and run migrations.
 * 3. Verify Telegram credentials, start polling, health server, deposit monitor.
 * 4. Shut down gracefully on SIGINT/SIGTERM.
 */
import 'dotenv/config';
import { loadConfig } from './config/env';
import { validateKeyMaterial } from './wallet/crypto';
import { createLogger } from './logging/logger';
import { createDatabase } from './db/client';
import { createApp } from './app';

async function main(): Promise<void> {
  // Fail fast on missing/invalid configuration.
  const config = loadConfig();

  const keyCheck = validateKeyMaterial(config.WALLET_ENCRYPTION_KEY);
  if (!keyCheck.ok) {
    console.error(`[fatal] WALLET_ENCRYPTION_KEY invalid: ${keyCheck.reason}`);
    process.exit(1);
  }

  const logger = createLogger(config.LOG_LEVEL);
  const database = createDatabase(config.DATABASE_URL);
  const app = createApp(config, logger, database);

  await app.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      await app.stop();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, 'error during shutdown');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled promise rejection');
  });
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
