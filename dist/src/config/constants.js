"use strict";
/**
 * Shared constants for the Nexo Snipe bot.
 * Values that must be configurable live in `config/env.ts`; these are
 * protocol-level constants that never change between environments.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TELEGRAM_POLL_ALLOWED_UPDATES = exports.TELEGRAM_POLL_TIMEOUT_SECONDS = exports.DEFAULT_RPC_URLS = exports.EXPLORER_ADDRESS_URL = exports.EXPLORER_TX_URL = exports.MAX_SLIPPAGE_BPS = exports.MIN_SLIPPAGE_BPS = exports.MIN_TRADE_LAMPORTS = exports.MIN_SOL_RESERVE = exports.DEPOSIT_DUST_LAMPORTS = exports.SOLANA_DERIVATION_PATH = exports.LAMPORTS_PER_SOL = exports.WSOL_MINT = exports.APP_VERSION = exports.APP_NAME = void 0;
/** Product name — overridable via the APP_NAME environment variable. */
exports.APP_NAME = process.env.APP_NAME?.trim() || 'Nexo Snipe';
exports.APP_VERSION = '1.7.1';
/** Wrapped-SOL mint (native SOL on SPL token rails). */
exports.WSOL_MINT = 'So11111111111111111111111111111111111111112';
/** Lamports in one SOL. */
exports.LAMPORTS_PER_SOL = 1_000_000_000;
/** Solana derivation path used for BIP39 mnemonics (standard for Solana). */
exports.SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";
/** Balance increases below this many lamports are ignored by the deposit monitor. */
exports.DEPOSIT_DUST_LAMPORTS = 1_000;
/** Minimum SOL the bot wallet keeps as rent/fees reserve on SOL withdrawals. */
exports.MIN_SOL_RESERVE = 0.01 * exports.LAMPORTS_PER_SOL;
/** Minimum trade size in lamports (0.001 SOL). */
exports.MIN_TRADE_LAMPORTS = 0.001 * exports.LAMPORTS_PER_SOL;
/** Slippage bounds (basis points) accepted from users. */
exports.MIN_SLIPPAGE_BPS = 10;
exports.MAX_SLIPPAGE_BPS = 3000;
/** Explorer base URLs. */
exports.EXPLORER_TX_URL = 'https://explorer.solana.com/tx/';
exports.EXPLORER_ADDRESS_URL = 'https://explorer.solana.com/address/';
/** Default RPC endpoints per network. */
exports.DEFAULT_RPC_URLS = {
    devnet: 'https://api.devnet.solana.com',
    mainnet: 'https://api.mainnet-beta.solana.com',
};
/** Long-polling options for the Telegram Bot API. */
exports.TELEGRAM_POLL_TIMEOUT_SECONDS = 30;
exports.TELEGRAM_POLL_ALLOWED_UPDATES = ['message', 'callback_query'];
//# sourceMappingURL=constants.js.map