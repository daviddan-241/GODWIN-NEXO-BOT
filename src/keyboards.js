// keyboards.js - All Telegram inline keyboards (ESM)
import { Markup } from 'telegraf';

function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Wallet', 'wallet'),
      Markup.button.callback('🔄 Refresh', 'refresh')
    ],
    [
      Markup.button.callback('🤖 AI Sniper', 'sniper'),
      Markup.button.callback('🔄 Copy Trade', 'copytrade')
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

function walletKeyboard(hasWallets, walletCount) {
  const buttons = [];
  
  buttons.push([
    Markup.button.callback(`🟣 Add SOL Wallet ${walletCount}`, 'wallet_add')
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

function sniperKeyboard(isActive) {
  const activateBtn = isActive
    ? Markup.button.callback('⏸️ Pause Sniper', 'sniper_pause')
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
      Markup.button.callback('🛡️ Anti-Rug: ON', 'sniper_antirug')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

function backToSniperKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Back to Sniper', 'sniper')]
  ]);
}

function backToDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Back to Dashboard', 'back_dashboard')]
  ]);
}

function cancelButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel')]
  ]);
}

function confirmCancelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✔ Confirm', 'withdraw_confirm'),
      Markup.button.callback('✘ Cancel', 'cancel')
    ]
  ]);
}

function tokenSearchKeyboard(tokenAddress) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💸 Buy', `buy_${tokenAddress}`),
      Markup.button.callback('📉 Sell', `sell_${tokenAddress}`)
    ],
    [
      Markup.button.callback('🔍 New Search', 'search'),
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

function buySellKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📈 Buy', 'buy_sol'),
      Markup.button.callback('📉 Sell', 'sell_token')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

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

function copyTradeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('▶️ START COPY TRADE', 'copytrade_start'),
      Markup.button.callback('🎯 Configure Target Wallet', 'copytrade_add')
    ],
    [
      Markup.button.callback('🏠 Dashboard', 'back_dashboard')
    ]
  ]);
}

export {
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
