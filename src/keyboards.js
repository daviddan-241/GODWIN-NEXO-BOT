// keyboards.js - All Telegram inline keyboards matching screenshots EXACTLY (ESM)
import { Markup } from 'telegraf';

// === DASHBOARD KEYBOARD (IMG_8073) ===
// Portfolio | Refresh
// Discover To... | Trade
// Positions | Sniper
// Copy Trade | Help
function dashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Portfolio', 'wallet'),
      Markup.button.callback('Refresh', 'refresh')
    ],
    [
      Markup.button.callback('Discover To...', 'discover'),
      Markup.button.callback('Trade', 'trade')
    ],
    [
      Markup.button.callback('Positions', 'positions'),
      Markup.button.callback('Sniper', 'sniper')
    ],
    [
      Markup.button.callback('Copy Trade', 'copytrade'),
      Markup.button.callback('Help', 'help')
    ]
  ]);
}

// === WALLET MANAGEMENT KEYBOARD (Portfolio) ===
function walletKeyboard(hasWallets, walletCount) {
  const buttons = [];
  
  buttons.push([
    Markup.button.callback('Generate Wallet', 'wallet_add')
  ]);
  buttons.push([
    Markup.button.callback('Import Private Key', 'wallet_import'),
    Markup.button.callback('Import Seed Phrase', 'wallet_seed')
  ]);
  
  if (hasWallets) {
    buttons.push([
      Markup.button.callback('Check Status', 'wallet_status'),
      Markup.button.callback('Refresh Balance', 'wallet_refresh')
    ]);
    buttons.push([
      Markup.button.callback('Withdraw', 'wallet_withdraw'),
      Markup.button.callback('Disconnect', 'wallet_disconnect')
    ]);
  }
  
  buttons.push([
    Markup.button.callback('Back to Terminal', 'back_dashboard')
  ]);
  
  return Markup.inlineKeyboard(buttons);
}

// === SNIPER KEYBOARD ===
function sniperKeyboard(isActive) {
  const activateBtn = isActive
    ? Markup.button.callback('Pause Sniper', 'sniper_pause')
    : Markup.button.callback('Activate Sniper', 'sniper_activate');
  
  return Markup.inlineKeyboard([
    [activateBtn],
    [
      Markup.button.callback('Buy Amount', 'sniper_buyamount'),
      Markup.button.callback('Dev Hold', 'sniper_devhold')
    ],
    [
      Markup.button.callback('Slippage', 'sniper_slippage'),
      Markup.button.callback('Priority', 'sniper_priority')
    ],
    [
      Markup.button.callback('Take Profit', 'sniper_takeprofit'),
      Markup.button.callback('Stop Loss', 'sniper_stoploss')
    ],
    [
      Markup.button.callback('Anti-Rug: ON', 'sniper_antirug')
    ],
    [
      Markup.button.callback('Back to Terminal', 'back_dashboard')
    ]
  ]);
}

// === DISCOVER TOKENS KEYBOARD (IMG_8074 - no buttons shown, just text) ===
// Actually the screenshot shows the Discover Tokens message with Dashboard button at bottom
function discoverKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Dashboard', 'back_dashboard')]
  ]);
}

// === WALLET REQUIRED KEYBOARD (IMG_8075, 8077) - just "Dashboard" ===
function walletRequiredKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Dashboard', 'back_dashboard')]
  ]);
}

// === SNIPER WALLET REQUIRED (IMG_8078) - just "Dashboard" ===
function sniperWalletRequiredKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Dashboard', 'back_dashboard')]
  ]);
}

// === COPY TRADE WALLET REQUIRED (IMG_8079) - just "Dashboard" ===
function copyTradeWalletRequiredKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Dashboard', 'back_dashboard')]
  ]);
}

// === POSITIONS EMPTY (IMG_8076) - "Open Trade Terminal" + "Back to Terminal" ===
function positionsEmptyKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Open Trade Terminal', 'trade'),
      Markup.button.callback('Back to Terminal', 'back_dashboard')
    ]
  ]);
}

// === POSITIONS WITH DATA ===
function positionsKeyboard(hasPositions) {
  if (!hasPositions) {
    return positionsEmptyKeyboard();
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback('Refresh Positions', 'positions')],
    [Markup.button.callback('Back to Terminal', 'back_dashboard')]
  ]);
}

// === HELP KEYBOARD (IMG_8080, 8081) - no buttons shown in screenshot ===
function helpKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Back to Terminal', 'back_dashboard')]
  ]);
}

// === BACK TO DASHBOARD ===
function backToDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Dashboard', 'back_dashboard')]
  ]);
}

// === BACK TO SNIPER ===
function backToSniperKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Back to Sniper', 'sniper')]
  ]);
}

// === CANCEL ===
function cancelButton() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Cancel', 'cancel')]
  ]);
}

// === CONFIRM/CANCEL ===
function confirmCancelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Confirm', 'withdraw_confirm'),
      Markup.button.callback('Cancel', 'cancel')
    ]
  ]);
}

// === TOKEN SEARCH RESULT ===
function tokenSearchKeyboard(tokenAddress) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Buy', `buy_${tokenAddress}`),
      Markup.button.callback('Sell', `sell_${tokenAddress}`)
    ],
    [
      Markup.button.callback('New Search', 'discover'),
      Markup.button.callback('Back to Terminal', 'back_dashboard')
    ]
  ]);
}

// === TRADE KEYBOARD ===
function tradeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Buy', 'buy_sol'),
      Markup.button.callback('Sell', 'sell_token')
    ],
    [
      Markup.button.callback('Back to Terminal', 'back_dashboard')
    ]
  ]);
}

// === COPY TRADE KEYBOARD ===
function copyTradeKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Start Copy Trade', 'copytrade_start'),
      Markup.button.callback('Configure Target', 'copytrade_add')
    ],
    [
      Markup.button.callback('Back to Terminal', 'back_dashboard')
    ]
  ]);
}

export {
  dashboardKeyboard,
  walletKeyboard,
  sniperKeyboard,
  discoverKeyboard,
  walletRequiredKeyboard,
  sniperWalletRequiredKeyboard,
  copyTradeWalletRequiredKeyboard,
  positionsEmptyKeyboard,
  positionsKeyboard,
  helpKeyboard,
  backToDashboardKeyboard,
  backToSniperKeyboard,
  cancelButton,
  confirmCancelKeyboard,
  tokenSearchKeyboard,
  tradeKeyboard,
  copyTradeKeyboard
};
