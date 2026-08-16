/**
 * Structured logging (pino) with secret redaction.
 *
 * SECURITY: never pass secrets into log calls. As defense-in-depth, pino
 * redacts common secret field names from any accidentally-logged objects.
 */
import pino from 'pino';
import { APP_NAME, APP_VERSION } from '../config/constants';

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

export type Logger = pino.Logger;

export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    base: { app: APP_NAME, version: APP_VERSION },
    redact: {
      paths: SECRET_PATHS.map((p) => `*.${p}`).concat(SECRET_PATHS),
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/**
 * Extracts a short, safe error message for logging. Never includes
 * stack details that might contain secrets; the full stack is logged
 * only at debug level via the logger itself.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
