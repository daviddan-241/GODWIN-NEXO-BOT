/**
 * Environment configuration checker: `npm run check:env`
 * Validates every variable without printing secret values.
 */
import 'dotenv/config';
import { loadConfig } from '../src/config/env';

function safeDbTarget(databaseUrl: string): string {
  try {
    const u = new URL(databaseUrl);
    return `${u.hostname}:${u.port || '5432'}/${u.pathname.replace(/^\//, '')}`;
  } catch {
    return '(unparseable — check DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    console.log('Environment configuration: OK');
    console.log(`  SOLANA_NETWORK        = ${config.SOLANA_NETWORK}`);
    console.log(`  RPC URL               = ${config.rpcUrl}`);
    console.log(`  mainnetTradingEnabled = ${config.mainnetTradingEnabled}`);
    console.log(`  tradingAllowed        = ${config.tradingAllowed}`);
    console.log(`  commitment            = ${config.COMMITMENT}`);
    console.log(`  DB target             = ${safeDbTarget(config.DATABASE_URL)}`);
    console.log(`  admin chat IDs        = ${config.ADMIN_CHAT_IDS.length} configured`);
    console.log(`  BOT_TOKEN             = set (${config.BOT_TOKEN.length} chars)`);
    console.log(`  WALLET_ENCRYPTION_KEY = set (${config.WALLET_ENCRYPTION_KEY.length} chars)`);
    console.log(`  PORT                  = ${config.PORT}`);
    console.log(`  LOG_LEVEL             = ${config.LOG_LEVEL}`);
    console.log(`  Telegram API root     = ${config.telegramApiRoot}`);
  } catch (err) {
    console.error('Environment configuration: INVALID');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

void main();
