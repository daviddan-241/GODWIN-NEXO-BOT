/**
 * Shared constants for the Nexo Snipe bot.
 * Values that must be configurable live in `config/env.ts`; these are
 * protocol-level constants that never change between environments.
 */

/** Product name — overridable via the APP_NAME environment variable. */
export const APP_NAME = process.env.APP_NAME?.trim() || 'Nexo Snipe';
export const APP_VERSION = '1.1.0';

/** Wrapped-SOL mint (native SOL on SPL token rails). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** Lamports in one SOL. */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Solana derivation path used for BIP39 mnemonics (standard for Solana). */
export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

/** Balance increases below this many lamports are ignored by the deposit monitor. */
export const DEPOSIT_DUST_LAMPORTS = 1_000;

/** Minimum SOL the bot wallet keeps as rent/fees reserve on SOL withdrawals. */
export const MIN_SOL_RESERVE = 0.01 * LAMPORTS_PER_SOL;

/** Minimum trade size in lamports (0.001 SOL). */
export const MIN_TRADE_LAMPORTS = 0.001 * LAMPORTS_PER_SOL;

/** Slippage bounds (basis points) accepted from users. */
export const MIN_SLIPPAGE_BPS = 10;
export const MAX_SLIPPAGE_BPS = 3000;

/** Explorer base URLs. */
export const EXPLORER_TX_URL = 'https://explorer.solana.com/tx/';
export const EXPLORER_ADDRESS_URL = 'https://explorer.solana.com/address/';

/** Default RPC endpoints per network. */
export const DEFAULT_RPC_URLS: Record<'devnet' | 'mainnet', string> = {
  devnet: 'https://api.devnet.solana.com',
  mainnet: 'https://api.mainnet-beta.solana.com',
};

/** Long-polling options for the Telegram Bot API. */
export const TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
export const TELEGRAM_POLL_ALLOWED_UPDATES = ['message', 'callback_query'] as const;
