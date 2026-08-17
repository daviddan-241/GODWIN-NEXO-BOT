"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
/**
 * Environment configuration layer.
 *
 * All secrets and settings come from environment variables, validated at
 * startup with zod. The process fails fast with a readable message if any
 * required variable is missing or malformed.
 */
const zod_1 = require("zod");
const constants_1 = require("./constants");
const boolFromString = (v) => {
    if (typeof v !== 'string')
        return undefined;
    if (v === 'true')
        return true;
    if (v === 'false')
        return false;
    return undefined;
};
const EnvSchema = zod_1.z
    .object({
    BOT_TOKEN: zod_1.z.string().min(1, 'BOT_TOKEN is required (get it from @BotFather)'),
    /**
     * ADMIN_IDS: comma-separated Telegram chat IDs that receive admin
     * notifications. ADMIN_CHAT_IDS and OWNER_TELEGRAM_ID are accepted as
     * backwards-compatible aliases. At least one of them is required.
     */
    ADMIN_IDS: zod_1.z.string().optional(),
    ADMIN_CHAT_IDS: zod_1.z.string().optional(),
    OWNER_TELEGRAM_ID: zod_1.z.string().optional(),
    APP_NAME: zod_1.z.string().min(1).max(32).default('Nexo Snipe'),
    /** Branding/links shown in the help screen. */
    SUPPORT_USERNAME: zod_1.z.string().default('ainexobotsupport'),
    WEBSITE_URL: zod_1.z.string().default('https://t.co/z1XgC7Zd6d'),
    TWITTER_URL: zod_1.z.string().default('https://x.com/Nexo?s=20'),
    /** Trade gate: minimum SOL balance required to trade. */
    MIN_SOL_BALANCE: zod_1.z.string().regex(/^\d+(\.\d+)?$/, 'MIN_SOL_BALANCE must be a number').optional(),
    /** Backwards-compatible alias of MIN_SOL_BALANCE. */
    MINIMUM_SOL: zod_1.z.string().regex(/^\d+(\.\d+)?$/, 'MINIMUM_SOL must be a number').optional(),
    /** Market data APIs. */
    COINGECKO_API_URL: zod_1.z.string().url().default('https://api.coingecko.com/api/v3'),
    DEXSCREENER_API_URL: zod_1.z.string().url().default('https://api.dexscreener.com'),
    /** Optional WebSocket endpoint for account-change driven deposit checks. */
    SOLANA_WS_URL: zod_1.z.string().url('SOLANA_WS_URL must be a valid URL').optional(),
    /** Optional owner seed phrase: derived at startup, address logged only. */
    SEED_PHRASE: zod_1.z.string().optional(),
    /** Health/UptimeRobot server. */
    HEALTHCHECK_ENABLED: zod_1.z.preprocess(boolFromString, zod_1.z.boolean().default(true)),
    /** Deposit monitor: consecutive polls a delta must persist before notify. */
    DEPOSIT_CONFIRMATION_POLLS: zod_1.z.coerce.number().int().min(1).max(10).default(2),
    /** Conversation FSM timeout (ms) — stale flows reset to idle. */
    CONVERSATION_TIMEOUT_MS: zod_1.z.coerce.number().int().min(1_000).default(600_000),
    /** Per-chat rate limiting. */
    RATE_LIMIT_MAX: zod_1.z.coerce.number().int().min(1).default(15),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().int().min(100).default(10_000),
    SOLANA_NETWORK: zod_1.z.enum(['devnet', 'mainnet']).default('devnet'),
    SOLANA_RPC_URL: zod_1.z.string().url('SOLANA_RPC_URL must be a valid URL').optional(),
    SOLANA_MAINNET_ENABLED: zod_1.z.preprocess(boolFromString, zod_1.z.boolean().default(false)),
    COMMITMENT: zod_1.z.enum(['confirmed', 'finalized']).default('confirmed'),
    WALLET_ENCRYPTION_KEY: zod_1.z
        .string()
        .min(12, 'ENCRYPTION_KEY is required — use `openssl rand -hex 32`')
        .optional(),
    /** Preferred name (v2 spec). WALLET_ENCRYPTION_KEY is an alias. */
    ENCRYPTION_KEY: zod_1.z
        .string()
        .min(12, 'ENCRYPTION_KEY is required — use `openssl rand -hex 32`')
        .optional(),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),
    JUPITER_QUOTE_API_URL: zod_1.z.string().url().default('https://quote-api.jup.ag/v6'),
    JUPITER_PRICE_API_URL: zod_1.z.string().url().default('https://api.jup.ag/price/v2'),
    DEFAULT_SLIPPAGE_BPS: zod_1.z.coerce.number().int().min(1).max(10_000).default(100),
    /** Hard cap per single trade in SOL (covers the sniper range 0.0001–1000). */
    TRADING_MAX_SOL_PER_TRADE: zod_1.z.coerce.number().positive().default(1000),
    DEPOSIT_POLL_INTERVAL_MS: zod_1.z.coerce.number().int().min(5_000).default(30_000),
    PORT: zod_1.z.coerce.number().int().min(1).max(65_535).default(8080),
    LOG_LEVEL: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    // Advanced/testing: override the Telegram Bot API root. Only used by the
    // test suite and self-hosters; defaults to the official API.
    TELEGRAM_API_ROOT: zod_1.z.string().url().optional(),
})
    .superRefine((env, ctx) => {
    if (!env.ADMIN_IDS && !env.ADMIN_CHAT_IDS && !env.OWNER_TELEGRAM_ID) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'ADMIN_IDS is required (comma-separated Telegram chat IDs, e.g. 123456789,987654321)',
            path: ['ADMIN_IDS'],
        });
    }
    if (!env.ENCRYPTION_KEY && !env.WALLET_ENCRYPTION_KEY) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'ENCRYPTION_KEY is required — use `openssl rand -hex 32`',
            path: ['ENCRYPTION_KEY'],
        });
    }
});
function parseAdminIds(env) {
    const raw = (env.ADMIN_IDS ?? env.ADMIN_CHAT_IDS ?? env.OWNER_TELEGRAM_ID ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n !== 0);
    return Array.from(new Set(raw)); // dedupe
}
function toAppConfig(env) {
    const rpcUrl = env.SOLANA_RPC_URL ?? constants_1.DEFAULT_RPC_URLS[env.SOLANA_NETWORK];
    /**
     * MAINNET SAFETY GATE
     * Real mainnet transactions require BOTH:
     *   SOLANA_NETWORK=mainnet AND SOLANA_MAINNET_ENABLED=true
     */
    const mainnetTradingEnabled = env.SOLANA_NETWORK === 'mainnet' && env.SOLANA_MAINNET_ENABLED === true;
    return {
        ...env,
        appName: env.APP_NAME,
        ADMIN_IDS: parseAdminIds(env),
        /** Wallet encryption key: ENCRYPTION_KEY (preferred) or its alias. */
        WALLET_ENCRYPTION_KEY: env.ENCRYPTION_KEY ?? env.WALLET_ENCRYPTION_KEY ?? '',
        /** Trade gate minimum (v2 name, MINIMUM_SOL kept as alias). */
        MIN_SOL_BALANCE: env.MIN_SOL_BALANCE ?? env.MINIMUM_SOL ?? '3.0000',
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
function loadConfig(env = process.env) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${details}`);
    }
    return toAppConfig(parsed.data);
}
//# sourceMappingURL=env.js.map