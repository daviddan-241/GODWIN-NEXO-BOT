// keyboards.js - All Telegram inline keyboards
const { Markup } = require('telegraf');

// Main Dashboard keyboard
function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Wallet', 'wallet'),
      Markup.button.callback('🔄 Refresh', 'refresh')
    ],
    [
      Markup.button.callback('🤖 AI Sniper', 'sniper'),
      Markup.button.callback('🔁 Copy Trade', 'copytrade')
    ],
    [
      Markup.button.callback('💸 Buy / Sell', 'buysell'),
      Markup.button.callback('📈 Positions', 'positions')
    ],
    [
      Markup.button.callback('🔍 Search Tok...', 'search'),
      Markup.button.callback('💬 Help', 'help')
    ]
  ]);
}

// Wallet Management keyboard
function walletKeyboard(hasWallets, walletCount) {
  const buttons = [];
  
  buttons.push([
    Markup.button.callback(`🟣 Add SOL Wallet ${walletCount + 1}`, 'wallet_add')
  ]);
  buttons.push([
    Markup.button.callback('🔑 Import to Wallet', 'wallet_import'),
    Markup.button.callback('✨ Seed → Wallet', 'wallet_seed')
  ]);
  buttons.push([
    Markup.button.callback('🟢 Connect Robinhood', 'wallet_robinhood')
  ]);
  
  if (hasWallets) {
    buttons.push([
      Markup.button.callback('✔️ Check Status', 'wallet_status'),
      Markup.button.callback('🔄 Refresh Balance', 'wallet_refresh')
    ]);
    buttons.push([
      Markup.button.callback('💸 Withdraw', 'wallet_withdraw'),
      Markup.button.callback('⚡ Disconnect Wallet', 'wallet_disconnect')
    ]);
  }
  
  buttons.push([
    Markup.button.callback('⬅️ Back to Dashboard', 'back_dashboard')
  ]);
  
  return Markup.inlineKeyboard(buttons);
}

// AI Sniper keyboard
function sniperKeyboard(isActive) {
  const activateBtn = isActive
    ? Markup.button.callback('⏸ Pause Sniper', 'sniper_pause')
    : Markup.button.callback('▶ Activate Sniper', 'sniper_activate');
  
  return Markup.inlineKeyboard([
    [activateBtn],
    [
      Markup.button.callback('💰 Buy Amount', 'sniper_buyamount'),
      Markup.button.callback('📊 Dev Hold', 'sniper_devhold')
    ],
    [
      Markup.button.callback('⚡ Slippage', 'sniper_slippage'),
      Markup.button.callback('🚀 Priority', 'sniper_priority')
    ],
    [
      Markup.button.callback('📈 Take Profit', 'sniper_takeprofit'),
      Markup.button.callback('📉 Stop Loss', 'sniper_stoploss')
    ],
    [
      Markup.button.callback('🛡 Anti-Rug: ON', 'sniper_antirug')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

// Back to sniper button
function backToSniperKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Back to Sniper', 'sniper')]
  ]);
}

// Back to dashboard button
function backToDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Back to Dashboard', 'back_dashboard')]
  ]);
}

// Cancel button
function cancelButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel')]
  ]);
}

// Confirm/Cancel buttons
function confirmCancelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✔ Confirm', 'withdraw_confirm'),
      Markup.button.callback('✘ Cancel', 'cancel')
    ]
  ]);
}

// Token search result keyboard
function tokenSearchKeyboard(tokenAddress) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Buy', `buy_${tokenAddress}`),
      Markup.button.callback('卖出 Sell', `sell_${tokenAddress}`)
    ],
    [
      Markup.button.callback('🔍 New Search', 'search'),
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

// Buy/Sell keyboard
function buySellKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Buy with SOL', 'buy_sol'),
      Markup.button.callback('💎 Buy with USDC', 'buy_usdc')
    ],
    [
      Markup.button.callback('🔄 Sell Token', 'sell_token'),
      Markup.button.callback('📊 Quick Buy', 'quickbuy')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

// Positions keyboard
function positionsKeyboard(hasPositions) {
  if (!hasPositions) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Search Token', 'search')],
      [Markup.button.callback('🏠 Dashboard', 'back_dashboard')]
    ]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('📈 Refresh Positions', 'positions')],
    [Markup.button.callback('🏠 Dashboard', 'back_dashboard')]
  ]);
}

// Help keyboard
function helpKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Wallet', 'wallet'),
      Markup.button.callback('🤖 AI Sniper', 'sniper')
    ],
    [
      Markup.button.callback('🔍 Search Token', 'search'),
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

// Copy Trade keyboard
function copyTradeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Add Wallet to Copy', 'copytrade_add'),
      Markup.button.callback('📋 List Copied', 'copytrade_list')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

module.exports = {
  dashboardKeyboard,
  walletKeyboard,
  sniperKeyboard,
  backToSniperKeyboard,
  backToDashboardKeyboard,
  cancelButton,
  confirmCancelKeyboard,
  tokenSearchKeyboard,
  buySellKeyboard,
  positionsKeyboard,
  helpKeyboard,
  copyTradeKeyboard
};
