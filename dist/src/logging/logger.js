"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
exports.safeErrorMessage = safeErrorMessage;
/**
 * Structured logging (pino) with secret redaction.
 *
 * SECURITY: never pass secrets into log calls. As defense-in-depth, pino
 * redacts common secret field names from any accidentally-logged objects.
 */
const pino_1 = __importDefault(require("pino"));
const constants_1 = require("../config/constants");
const SECRET_PATHS = [
    'BOT_TOKEN',
    'botToken',
    'bot_token',
    'WALLET_ENCRYPTION_KEY',
    'walletEncryptionKey',
    'DATABASE_URL',
    'databaseUrl',
    'token',
    'secret',
    'privateKey',
    'private_key',
    'mnemonic',
    'seed',
    'encryptedSecret',
    'apiKey',
    'api_key',
    'password',
];
function createLogger(level = 'info') {
    return (0, pino_1.default)({
        level,
        base: { app: constants_1.APP_NAME, version: constants_1.APP_VERSION },
        redact: {
            paths: SECRET_PATHS.map((p) => `*.${p}`).concat(SECRET_PATHS),
            censor: '[REDACTED]',
        },
        timestamp: pino_1.default.stdTimeFunctions.isoTime,
    });
}
/**
 * Extracts a short, safe error message for logging. Never includes
 * stack details that might contain secrets; the full stack is logged
 * only at debug level via the logger itself.
 */
function safeErrorMessage(err) {
    if (err instanceof Error)
        return err.message;
    return String(err);
}
//# sourceMappingURL=logger.js.map