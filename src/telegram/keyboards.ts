/**
 * Inline keyboards — matching the v2 spec button labels exactly.
 */
import { InlineKeyboard } from 'grammy';

/** Persistent main keyboard: 💼 Portfolio | 🔄 Refresh | 🪙 Discover To… | ⚡ Trade | 📊 Positions | 🤖 Sniper | 🐋 Copy Trade | ❓ Help */
export function dashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
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
export function walletKeyboard(hasWallets: boolean, nextWalletNumber: number): InlineKeyboard {
  const kb = new InlineKeyboard()
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
export function sniperKeyboard(isActive: boolean): InlineKeyboard {
  return new InlineKeyboard()
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
export function backToDashboardKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}

/** Discover Tokens screen. */
export function discoverKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}

/** Wallet-required gates (Trade/Sniper/CopyTrade). */
export function walletRequiredKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🏠 Dashboard', 'back_dashboard');
}

/** Positions screen. */
export function positionsKeyboard(hasPositions: boolean): InlineKeyboard {
  if (!hasPositions) {
    return new InlineKeyboard().text('⚡ Open Trade Terminal', 'trade').text('🏠 Back to Terminal', 'back_dashboard');
  }
  return new InlineKeyboard().text('🔄 Refresh Positions', 'positions').row().text('🏠 Back to Terminal', 'back_dashboard');
}

/** Help screen. */
export function helpKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🏠 Back to Terminal', 'back_dashboard');
}

/** Back to Sniper (after settings). */
export function backToSniperKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('🤖 Back to Sniper', 'sniper');
}

/** Cancel button. */
export function cancelButton(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'cancel');
}

/** Withdraw confirm. */
export function confirmCancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('✅ Confirm', 'withdraw_confirm').text('❌ Cancel', 'cancel');
}

/** Disconnect picker (IMG_8145): one button per connected wallet. */
export function disconnectPickerKeyboard(
  wallets: Array<{ address: string; walletNumber: number }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const w of wallets) {
    kb.text(`🔌 Disconnect SOL Wallet ${w.walletNumber} (${w.address.slice(0, 8)}…)`, `dw_${w.address}`).row();
  }
  return kb.text('❌ Cancel', 'cancel');
}

/** Permanent-disconnect confirmation (IMG_8146). */
export function disconnectConfirmKeyboard(address: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm Disconnect', `dwc_${address}`)
    .text('❌ Cancel', 'cancel');
}

/** Open-positions picker for Sell Position. */
export function sellPositionsKeyboard(
  positions: Array<{ tokenAddress: string; tokenSymbol: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of positions) {
    kb.text(`💸 ${p.tokenSymbol}`, `sell_${p.tokenAddress}`).row();
  }
  return kb.text('❌ Cancel', 'cancel');
}

/** Token search result. */
export function tokenSearchKeyboard(tokenAddress: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('🪙 Buy', `buy_${tokenAddress}`)
    .text('💸 Sell', `sell_${tokenAddress}`)
    .row()
    .text('🔄 New Search', 'discover')
    .text('🏠 Back to Terminal', 'back_dashboard');
}

/** TRADE TERMINAL (IMG_8147). */
export function tradeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🪙 Buy Token', 'buy_sol')
    .text('💸 Sell Position', 'sell_token')
    .row()
    .text('📊 View Positions', 'positions')
    .text('🏠 Terminal', 'back_dashboard');
}

/** Copy trade screen (v2 limits). */
export function copyTradeKeyboard(mode: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('▶️ Start Copy Trade', 'copytrade_start')
    .text('🎯 Configure Target', 'copytrade_add')
    .row()
    .text(mode === 'buy_only' ? 'Mode: Buy Only' : 'Mode: Buy + Sell', 'copytrade_mode')
    .text('⚙️ Set Limits', 'copytrade_limits')
    .row()
    .text('🏠 Back to Terminal', 'back_dashboard');
}

/** CONFIRM BUY inline (dynamic). */
export function confirmBuyKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('✅ Confirm Buy', 'confirm_buy').text('❌ Cancel', 'cancel');
}

/** Trade wallet picker (multi-wallet). */
export function walletPickerKeyboard(wallets: Array<{ address: string; walletNumber: number }>): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const w of wallets) {
    kb.text(`🟢 SOL Wallet ${w.walletNumber} · ${w.address.slice(0, 6)}…`, `tw_${w.address}`).row();
  }
  return kb.text('❌ Cancel', 'cancel');
}
