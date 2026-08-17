"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Hfive — Solana trading Telegram bot. Production entrypoint.
 *
 * 1. Load & validate environment configuration (fail fast).
 * 2. Connect to PostgreSQL and run migrations.
 * 3. Verify Telegram credentials, start polling, health server, deposit monitor.
 * 4. Shut down gracefully on SIGINT/SIGTERM.
 */
require("dotenv/config");
const env_1 = require("./config/env");
const crypto_1 = require("./wallet/crypto");
const logger_1 = require("./logging/logger");
const client_1 = require("./db/client");
const app_1 = require("./app");
async function main() {
    // Fail fast on missing/invalid configuration.
    const config = (0, env_1.loadConfig)();
    const keyCheck = (0, crypto_1.validateKeyMaterial)(config.WALLET_ENCRYPTION_KEY);
    if (!keyCheck.ok) {
        console.error(`[fatal] WALLET_ENCRYPTION_KEY invalid: ${keyCheck.reason}`);
        process.exit(1);
    }
    const logger = (0, logger_1.createLogger)(config.LOG_LEVEL);
    const database = (0, client_1.createDatabase)(config.DATABASE_URL);
    const app = (0, app_1.createApp)(config, logger, database);
    await app.start();
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger.info({ signal }, 'shutting down');
        try {
            await app.stop();
        }
        catch (err) {
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
//# sourceMappingURL=index.js.map