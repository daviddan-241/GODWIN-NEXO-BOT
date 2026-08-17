"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardKeyboard = dashboardKeyboard;
exports.walletKeyboard = walletKeyboard;
exports.sniperKeyboard = sniperKeyboard;
exports.backToDashboardKeyboard = backToDashboardKeyboard;
exports.discoverKeyboard = discoverKeyboard;
exports.walletRequiredKeyboard = walletRequiredKeyboard;
exports.positionsKeyboard = positionsKeyboard;
exports.helpKeyboard = helpKeyboard;
exports.backToSniperKeyboard = backToSniperKeyboard;
exports.cancelButton = cancelButton;
exports.confirmCancelKeyboard = confirmCancelKeyboard;
exports.tokenSearchKeyboard = tokenSearchKeyboard;
exports.tradeKeyboard = tradeKeyboard;
exports.copyTradeKeyboard = copyTradeKeyboard;
exports.confirmBuyKeyboard = confirmBuyKeyboard;
exports.walletPickerKeyboard = walletPickerKeyboard;
/**
 * Inline keyboards — matching the v2 spec button labels exactly.
 */
const grammy_1 = require("grammy");
/** Persistent main keyboard: 💼 Portfolio | 🔄 Refresh | 🪙 Discover To… | ⚡ Trade | 📊 Positions | 🤖 Sniper | 🐋 Copy Trade | ❓ Help */
function dashboardKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text('💼 Portfolio', 'wallet')
        .text('🔄 Refresh', 'refresh')
        .row()
        .text('🪙 Discover To…', 'discover')
        .text('⚡ Trade', 'trade')
        .row()
        .text('📊 Positions', 'positions')
        .text('🤖 Sniper', 'sniper')
        .row()
        .text('🐋 Copy Trade', 'copytrade')
        .text('❓ Help', 'help');
}
/** PORTFOLIO / WALLETS actions (dynamic wallet numbering). */
function walletKeyboard(hasWallets, nextWalletNumber) {
    const kb = new grammy_1.InlineKeyboard()
        .text(`🟣 Add SOL Wallet ${nextWalletNumber}`, 'wallet_add')
        .row()
        .text('🔑 Import to Wallet…', 'wallet_import')
        .text(`🧩 Seed → Wallet ${nextWalletNumber}`, 'wallet_seed')
        .row()
        .text('🟢 Connect Robinhood', 'wallet_robinhood')
        .row();
    if (hasWallets) {
        kb.text('📈 Check Status', 'wallet_status').text('🔄 Refresh Balance', 'wallet_refresh').row();
        kb.text('💸 Withdraw', 'wallet_withdraw').text('🔌 Disconnect Wallet', 'wallet_disconnect').row();
    }
    return kb.text('⬅️ Back to Dashboard', 'back_dashboard');
}
/** AI Sniper screen. */
function sniperKeyboard(isActive) {
    return new grammy_1.InlineKeyboard()
        .text(isActive ? '⏸️ Pause Sniper' : '▶️ Activate Sniper', isActive ? 'sniper_pause' : 'sniper_activate')
        .row()
        .text('Buy Amount', 'sniper_buyamount')
        .text('Dev Hold', 'sniper_devhold')
        .row()
        .text('Slippage', 'sniper_slippage')
        .text('Priority', 'sniper_priority')
        .row()
        .text('Take Profit', 'sniper_takeprofit')
        .text('Stop Loss', 'sniper_stoploss')
        .row()
        .text('Anti-Rug: ON', 'sniper_antirug')
        .row()
        .text('🏠 Back to Terminal', 'back_dashboard');
}
/** Single "🏠 Dashboard" button (wallet-required screens). */
function backToDashboardKeyboard() {
    return new grammy_1.InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}
/** Discover Tokens screen. */
function discoverKeyboard() {
    return new grammy_1.InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}
/** Wallet-required gates (Trade/Sniper/CopyTrade). */
function walletRequiredKeyboard() {
    return new grammy_1.InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}
/** Positions screen. */
function positionsKeyboard(hasPositions) {
    if (!hasPositions) {
        return new grammy_1.InlineKeyboard().text('⚡ Open Trade Terminal', 'trade').text('🏠 Back to Terminal', 'back_dashboard');
    }
    return new grammy_1.InlineKeyboard().text('🔄 Refresh Positions', 'positions').row().text('🏠 Back to Terminal', 'back_dashboard');
}
/** Help screen. */
function helpKeyboard() {
    return new grammy_1.InlineKeyboard().text('🏠 Back to Terminal', 'back_dashboard');
}
/** Back to Sniper (after settings). */
function backToSniperKeyboard() {
    return new grammy_1.InlineKeyboard().text('🤖 Back to Sniper', 'sniper');
}
/** Cancel button. */
function cancelButton() {
    return new grammy_1.InlineKeyboard().text('❌ Cancel', 'cancel');
}
/** Withdraw confirm. */
function confirmCancelKeyboard() {
    return new grammy_1.InlineKeyboard().text('✅ Confirm', 'withdraw_confirm').text('❌ Cancel', 'cancel');
}
/** Token search result. */
function tokenSearchKeyboard(tokenAddress) {
    return new grammy_1.InlineKeyboard()
        .text('🪙 Buy', `buy_${tokenAddress}`)
        .text('💸 Sell', `sell_${tokenAddress}`)
        .row()
        .text('🔄 New Search', 'discover')
        .text('🏠 Back to Terminal', 'back_dashboard');
}
/** Trade screen. */
function tradeKeyboard() {
    return new grammy_1.InlineKeyboard()
        .text('🪙 Buy', 'buy_sol')
        .text('💸 Sell', 'sell_token')
        .row()
        .text('🏠 Back to Terminal', 'back_dashboard');
}
/** Copy trade screen (v2 limits). */
function copyTradeKeyboard(mode) {
    return new grammy_1.InlineKeyboard()
        .text('▶️ Start Copy Trade', 'copytrade_start')
        .text('🎯 Configure Target', 'copytrade_add')
        .row()
        .text(mode === 'buy_only' ? 'Mode: Buy Only' : 'Mode: Buy + Sell', 'copytrade_mode')
        .text('⚙️ Set Limits', 'copytrade_limits')
        .row()
        .text('🏠 Back to Terminal', 'back_dashboard');
}
/** CONFIRM BUY inline (dynamic). */
function confirmBuyKeyboard() {
    return new grammy_1.InlineKeyboard().text('✅ Confirm Buy', 'confirm_buy').text('❌ Cancel', 'cancel');
}
/** Trade wallet picker (multi-wallet). */
function walletPickerKeyboard(wallets) {
    const kb = new grammy_1.InlineKeyboard();
    for (const w of wallets) {
        kb.text(`🟢 SOL Wallet ${w.walletNumber} · ${w.address.slice(0, 6)}…`, `tw_${w.address}`).row();
    }
    return kb.text('❌ Cancel', 'cancel');
}
//# sourceMappingURL=keyboards.js.map