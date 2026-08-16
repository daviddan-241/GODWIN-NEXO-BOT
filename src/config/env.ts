/**
 * Environment configuration layer.
 *
 * All secrets and settings come from environment variables, validated at
 * startup with zod. The process fails fast with a readable message if any
 * required variable is missing or malformed.
 */
import { z } from 'zod';
import { DEFAULT_RPC_URLS } from './constants';

const boolFromString = (v: unknown) => {
  if (typeof v !== 'string') return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};

const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required (get it from @BotFather)'),
  ADMIN_CHAT_IDS: z
    .string()
    .min(1, 'ADMIN_CHAT_IDS is required (comma-separated Telegram chat IDs)')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n !== 0),
    ),

  SOLANA_NETWORK: z.enum(['devnet', 'mainnet']).default('devnet'),
  SOLANA_RPC_URL: z.string().url('SOLANA_RPC_URL must be a valid URL').optional(),
  SOLANA_MAINNET_ENABLED: z.preprocess(boolFromString, z.boolean().default(false)),
  COMMITMENT: z.enum(['confirmed', 'finalized']).default('confirmed'),

  WALLET_ENCRYPTION_KEY: z
    .string()
    .min(12, 'WALLET_ENCRYPTION_KEY is required — use `openssl rand -hex 32`'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),

  JUPITER_QUOTE_API_URL: z.string().url().default('https://quote-api.jup.ag/v6'),
  JUPITER_PRICE_API_URL: z.string().url().default('https://api.jup.ag/price/v2'),
  DEFAULT_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(10_000).default(100),
  TRADING_MAX_SOL_PER_TRADE: z.coerce.number().positive().default(10),
  DEPOSIT_POLL_INTERVAL_MS: z.coerce.number().int().min(5_000).default(30_000),

  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Advanced/testing: override the Telegram Bot API root. Only used by the
  // test suite and self-hosters; defaults to the official API.
  TELEGRAM_API_ROOT: z.string().url().optional(),
});

export type AppConfig = ReturnType<typeof toAppConfig>;

function toAppConfig(env: z.infer<typeof EnvSchema>) {
  const rpcUrl =
    env.SOLANA_RPC_URL ?? DEFAULT_RPC_URLS[env.SOLANA_NETWORK];

  /**
   * MAINNET SAFETY GATE
   * Real mainnet transactions require BOTH:
   *   SOLANA_NETWORK=mainnet AND SOLANA_MAINNET_ENABLED=true
   */
  const mainnetTradingEnabled =
    env.SOLANA_NETWORK === 'mainnet' && env.SOLANA_MAINNET_ENABLED === true;

  return {
    ...env,
    rpcUrl,
    mainnetTradingEnabled,
    /** Trading is allowed on devnet by default; mainnet needs the explicit gate. */
    tradingAllowed: env.SOLANA_NETWORK === 'devnet' ? true : mainnetTradingEnabled,
    telegramApiRoot: env.TELEGRAM_API_ROOT ?? 'https://api.telegram.org',
    isDevnet: env.SOLANA_NETWORK === 'devnet',
    maxTradeLamports: env.TRADING_MAX_SOL_PER_TRADE * 1_000_000_000,
  };
}

/**
 * Loads and validates configuration from process.env.
 * Throws a single aggregated error listing every problem.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return toAppConfig(parsed.data);
}
