/**
 * All user-facing copy — matching the v2 product spec exactly.
 * Plain text throughout (HTML parse mode safe).
 */
import { formatMoney } from './formatters';

export const supportUsername = (process.env.SUPPORT_USERNAME || 'ainexobotsupport').replace(/^@/, '');
export const websiteUrl = process.env.WEBSITE_URL || 'https://t.co/z1XgC7Zd6d';
export const twitterUrl = process.env.TWITTER_URL || 'https://x.com/Nexo?s=20';

// === START / WELCOME (exact v2 spec) ===
export function startMessage(firstName: string, minimum: string): string {
  return `👋 Hello, ${firstName}!\n\n🟢 NEXO TRADING TERMINAL\nMARKET FEED: CONNECTED\n\nFeatures:\n• Discover trending memecoins\n• Review liquidity and volume\n• Scan contract risk signals\n• Track positions and exits\n\n🔒 TRADE GATE: Wallet + balance check\n✏️ Minimum: ${minimum} SOL minimum\n👉 Connect a wallet to get started.`;
}

// === DASHBOARD (wallet connected) ===
export function dashboardMessage(
  wallets: Array<{ address: string; balance: number }>,
  solPrice: number,
  minimum: string,
): string {
  let walletText = '';
  let totalBalanceSol = 0;
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    totalBalanceSol += w.balance;
    walletText += `Wallet ${i + 1}: ${w.balance.toFixed(6)} SOL ($${(w.balance * solPrice).toFixed(2)})\n`;
    walletText += `${w.address}\n`;
  }
  if (wallets.length === 0) {
    walletText = 'No wallet connected.\nConnect a wallet to get started.';
  }
  return `🟢 NEXO TRADING TERMINAL\n\nMARKET FEED: CONNECTED\nDiscover trending memecoins\nReview liquidity and volume\nScan contract risk signals\nTrack positions and exits\n\n🔒 TRADE GATE: Wallet + balance check\n✏️ Minimum: ${minimum} SOL minimum\n\nYOUR PORTFOLIO\n${walletText}\nTotal Balance: ${totalBalanceSol.toFixed(6)} SOL ($${(totalBalanceSol * solPrice).toFixed(2)})`;
}

// === DISCOVER TOKENS (exact v2 spec) ===
export function discoverTokensMessage(): string {
  return `🪙 DISCOVER TOKENS\nSend a token name, symbol, or contract address to inspect its market data.\nThe bot checks the pair, liquidity, volume and available safety signals before you decide.\n\nExamples:\n• BONK\n• Pepe\n• DezXAZ8z7PnrnRJ… (SOL CA)\n• 0x6982508145454Ce325dDbE47a25d4ec3d2311933 (ETH CA)\n\n⚠️ Discovery is not an endorsement. Review the risk section before trading.`;
}

// === WALLET REQUIRED GATES (exact v2 spec) ===
export function walletRequiredMessage(): string {
  return `⚠️ Wallet Required\nPlease connect a wallet first to buy or sell tokens.`;
}

export function sniperWalletRequiredMessage(): string {
  return `⚠️ You need a connected wallet to use AI Sniper.`;
}

export function copyTradeWalletRequiredMessage(): string {
  return `⚠️ You need a connected wallet to use Copy Trade.`;
}

// === POSITIONS (exact v2 spec) ===
export function positionsEmptyMessage(): string {
  return `📊 POSITIONS\n\nYou have no open positions.\nDiscover a token and confirm a buy to create your first position.`;
}

export function positionsMessage(
  positions: Array<{ tokenSymbol: string; amount: number; entryPrice: number; pnl: number; status: string }>,
): string {
  if (!positions || positions.length === 0) return positionsEmptyMessage();
  let text = `📊 POSITIONS\n\n`;
  for (const pos of positions) {
    const pnlEmoji = pos.pnl >= 0 ? '📈' : '📉';
    text += `${pos.tokenSymbol} - ${pos.amount} SOL\n`;
    text += `Entry: $${pos.entryPrice}\n`;
    text += `Current PnL: ${pnlEmoji} ${pos.pnl.toFixed(2)}%\n`;
    text += `Status: ${pos.status}\n\n`;
  }
  return text;
}

// === HELP / CONTROL CENTER (exact v2 spec) ===
export function helpMessage(): string {
  return `NEXO CONTROL CENTER\n\nTrading flow\n1. Open Portfolio and connect or import a wallet\n2. Use Discover Tokens to inspect a symbol or contract\n3. Review price, liquidity and safety signals\n4. Use Trade to buy or sell after the balance gate passes\n5. Track open exposure in Positions\n\nTrade requirement\nBuy and sell actions require a connected wallet and the configured minimum balance. The exact requirement is shown in the dashboard and trade screen.\n\n🔐 Non-Custodial\nNEXO is fully non-custodial. We never hold, access, or control your funds.\n\nCommands\n/start — Open terminal\n/wallet — Manage portfolio wallets\n/generate — Create a new wallet\n/import — Import an existing wallet\n/status — Check wallet status\n\nLinks\nWebsite:\n${websiteUrl}\nTwitter:\n${twitterUrl}\n\nSupport:\neg. (@${supportUsername})\n\nNexo - Your Wealth Platform for Digital Assets\nDiscover Nexo, the comprehensive platform that's driving the next generation of crypto wealth. Grow, trade, borrow, and accrue interest on your digital assets.`;
}

// === PORTFOLIO / WALLETS (exact v2 spec) ===
export function walletManagementMessage(
  wallets: Array<{ address: string; balance: number }>,
  solPrice: number,
): string {
  let walletText = '';
  let totalBalance = 0;
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    totalBalance += w.balance;
    walletText += `🟢 SOL Wallet ${i + 1}: ${w.balance.toFixed(6)} SOL ($${(w.balance * solPrice).toFixed(2)})\n`;
    walletText += `${w.address}\n\n`;
  }
  if (wallets.length === 0) walletText = 'No wallets connected.';
  return `PORTFOLIO / WALLETS\n\n💰 YOUR WALLETS (${wallets.length})\n\n${walletText}\nTotal Balance: ${totalBalance.toFixed(6)} SOL ($${(totalBalance * solPrice).toFixed(2)})\n\nChoose an action below:`;
}

// === WALLET CREATED / IMPORTED ===
export function walletCreatedMessage(address: string): string {
  return `Wallet Created\n\nWallet Address:\n${address}\nBalance: 0.000000 SOL\n\nYour Solana wallet is ready to use.`;
}

export function walletImportedMessage(address: string, balance: number): string {
  return `Wallet Created\n\nWallet Address:\n${address}\nBalance: ${balance.toFixed(6)} SOL\n\nYour Solana wallet is ready to use.`;
}

// === IMPORT WALLET (exact v2 spec text) ===
export function importWalletMessage(): string {
  return `🔑 Import Solana Wallet 🔒\n\nYou need to connect your wallet to access this feature.\nNexo Snipe uses bank-grade security to protect your assets.\nAll connections are read-only and encrypted.\n\nPlease send your Solana wallet seed phrase (12 or 24 words).\n\n⚠️ IMPORTANT: Never share your seed phrase with anyone else. This bot stores your key securely to enable trading functionality.`;
}

export function importSeedPromptMessage(): string {
  return `Import Wallet from Seed Phrase\n\nPlease send your 12 or 24-word seed phrase:`;
}

// === SNIPER ===
export interface SniperSettingsView {
  status: string;
  positionSize: number;
  maxDevHold: number;
  slippage: number;
  priorityFee: number;
  takeProfit: number;
  stopLoss: number;
  antiRug: boolean;
}

export function sniperMessage(settings: SniperSettingsView): string {
  const statusEmoji = settings.status === 'ACTIVE' ? '🟢' : '🔴';
  return `🤖 AI SNIPER\n\n${statusEmoji} Status: ${settings.status}\n\nTrading Parameters\nPosition Size: ${settings.positionSize} SOL\nMax Dev Hold: ${settings.maxDevHold}%\nSlippage: ${settings.slippage}%\nPriority Fee: ${settings.priorityFee} SOL\n\nRisk Management\nTake Profit: +${settings.takeProfit}%\nStop Loss: -${settings.stopLoss}%\nAnti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}\n\nProfessional-grade automated trading engine`;
}

export function settingUpdatedMessage(settings: SniperSettingsView): string {
  return `SETTING UPDATED\n\nSNIPER CONFIGURATION\nStatus: ${settings.status === 'ACTIVE' ? '✅' : '🔴'} ${settings.status}\nBuy Amount: ${settings.positionSize} SOL\nDev Holding: ${settings.maxDevHold}%\nSlippage: ${settings.slippage}%\nPriority Fee: ${settings.priorityFee} SOL\nTake Profit: +${settings.takeProfit}%\nStop Loss: -${settings.stopLoss}%\nAnti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}\n\nSettings saved and ready`;
}

// === CONFIG PROMPTS ===
export const configPositionSizeMessage = () => `Set Position Size\n\nSet the SOL amount for each automated trade.\n\nRange: 0.0001 - 1000 SOL\nRecommended: 10 - 50 SOL\n\nRisk Level:\n- 1-10 SOL: Conservative\n- 10-50 SOL: Moderate\n- 50+ SOL: Aggressive\n\nEnter your position size:`;

export const configDevHoldMessage = () => `Set Max Dev Holding\n\nOnly snipe tokens where developer holds less than this percentage.\n\nRange: 0-100%\nRecommended: 10-30%\nExamples: 10, 20, 30\n\nSend your preferred percentage:`;

export const configSlippageMessage = () => `Set Slippage\n\nSet maximum acceptable price movement during execution.\n\nRange: 1-50%\nRecommended: 8-12%\n\nGuide:\n- 5-8%: Tight (may fail in volatile conditions)\n- 8-12%: Balanced (recommended)\n- 15%+: Loose (higher execution, more slippage)\n\nEnter slippage percentage:`;

export const configPriorityMessage = () => `Set Priority Fee\n\nHigher priority fees increase transaction speed on Solana.\n\nRange: 0.0001 - 0.1 SOL\nRecommended: 0.001 - 0.01 SOL\n\nEnter priority fee in SOL:`;

export const configTakeProfitMessage = () => `Set Take Profit\n\nAutomatically sell when profit reaches this percentage.\n\nRange: 10-1000%\nRecommended: 100% (2x)\nExamples:\n- 50% (1.5x)\n- 100% (2x)\n- 200% (3x)\n- 500% (6x)\n\nSend your take profit percentage:`;

export const configStopLossMessage = () => `Set Stop Loss\n\nAutomatically sell to protect capital when loss reaches this percentage.\n\nRange: 10-90%\nRecommended: 30% (Protects 70%)\nExamples:\n- 20% (Conservative)\n- 30% (Balanced)\n- 50% (Aggressive)\n\nSend your stop loss percentage:`;

// === TOKEN ===
export function tokenNotFoundMessage(): string {
  return `Token Not Found\n\nThe token you searched for could not be found on Solana DEX.\n\nPlease try again with a different search term or contract address.`;
}

// === WITHDRAWAL ===
export function withdrawalMessage(balance: number): string {
  return `WITHDRAWAL\n\nYour Balance: ${balance.toFixed(6)} SOL\n\nPlease send the wallet address you want to withdraw to:`;
}

export function withdrawalAmountMessage(toAddress: string): string {
  return `WITHDRAWAL\n\nTo: ${toAddress}\n\nNow enter the amount of SOL you want to withdraw:`;
}

export function confirmWithdrawalMessage(amount: string, toAddress: string, balance: number): string {
  return `CONFIRM WITHDRAWAL\n\nAmount: ${amount} SOL\nTo:\n${toAddress}\nYour Balance: ${balance.toFixed(6)} SOL\n\nPlease confirm to proceed:`;
}

export function withdrawalSubmittedMessage(amount: string, toAddress: string): string {
  return `WITHDRAWAL REQUEST SUBMITTED\n\nAmount: ${amount} SOL\nTo:\n${toAddress}\nYour withdrawal is being processed.\nPlease allow up to 24 hours.\n\nNeed help? Contact @${supportUsername}`;
}

// === COPY TRADE (with v2 limits) ===
export interface CopyTradeView {
  status: string;
  targetWallet: string | null;
  mode: string;
  maxSolPerTrade: number;
  maxDailySol: number;
  slippage: number;
  tokenFilter: string | null;
}

export function copyTradeMessage(cfg: CopyTradeView): string {
  return `🐋 COPY TRADING SYSTEM\n\nSTATUS: ${cfg.status}\n\nCONFIGURATION\nTarget Wallet: ${cfg.targetWallet ?? 'NOT SET'}\n${cfg.targetWallet ? '' : 'NOT CONFIGURED\n'}Max SOL/Trade: ${cfg.maxSolPerTrade}\nMax Daily Exposure: ${cfg.maxDailySol} SOL\nSlippage: ${cfg.slippage}%\nToken Filter: ${cfg.tokenFilter ?? 'ALL'}\nMode: ${cfg.mode === 'buy_only' ? 'Buy Only' : 'Buy + Sell'}\n\nHOW IT WORKS\n- Monitor target wallet in real-time\n- Auto-replicate buy/sell signals\n- Execute trades with same parameters\n- Professional trader mirroring\n\nFollow proven strategies effortlessly`;
}

export function copyTradeActivatedMessage(): string {
  return `COPY TRADING ACTIVATED\n\nNow mirroring target wallet\nReal-time trade alerts enabled\nYou will be notified of every trade`;
}

export const configureTargetWalletMessage = () => `CONFIGURE TARGET WALLET\n\nEnter the Solana wallet address of the trader you want to copy.\n\nRequirements:\n- Valid Base58 Solana address\n- Active trading wallet\n- Public transaction history\n\nPaste the complete wallet address below:`;

export const copyLimitsStepMessage = (step: string) => {
  switch (step) {
    case 'max_per_trade':
      return `Set Max SOL Per Trade\n\nMaximum SOL used for a single copied trade.\n\nSend the amount in SOL:`;
    case 'max_daily':
      return `Set Max Daily Exposure\n\nMaximum SOL spent on copied trades per day.\n\nSend the amount in SOL:`;
    case 'slippage':
      return `Set Copy Slippage\n\nMaximum acceptable price movement for copied trades (1-50%).\n\nSend the percentage:`;
    case 'token_filter':
      return `Set Token Filter\n\nOnly copy trades for one token, or type ALL for every token.\n\nSend a Solana mint address, or ALL:`;
    default:
      return `Copy trade configuration step.`;
  }
};

// === TRADE ===
export function tradeMessage(): string {
  return `⚡ TRADE\n\nBuy: Purchase tokens instantly\nSell: Sell your tokens quickly\n\nSend the token contract address to begin.`;
}

export function insufficientBalanceMessage(balance: number, minimum: string): string {
  const min = parseFloat(minimum) || 3;
  return `Insufficient Balance\n\nYour Balance: ${balance.toFixed(6)} SOL\nMinimum Required: ${minimum} SOL\nYou Need: ${Math.max(0, min - balance).toFixed(6)} SOL more\n\nDeposit SOL to your wallet to start trading.`;
}

export const buyTokenPromptMessage = () => `Send the token contract address you want to buy:`;
export const sellTokenPromptMessage = () => `Send the token contract address you want to sell:`;

export function confirmBuyMessage(
  token: { name: string; symbol: string; address: string; priceUsd: number; liquidity: number; riskLevel: string },
  amountSol: number,
  slippage: number,
  walletLabel: string,
): string {
  const price = token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6);
  return `CONFIRM BUY\n\n${token.name} (${token.symbol})\n${token.address}\nPrice: $${price}\nLiquidity: $${formatMoney(token.liquidity)}\nRisk: ${token.riskLevel}\n\nWallet: ${walletLabel}\nAmount: ${amountSol} SOL\nSlippage: ${slippage}%\n\nConfirm purchase?`;
}

export function confirmSellMessage(token: { name: string; symbol: string; address: string; priceUsd: number }): string {
  const price = token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6);
  return `CONFIRM SELL\n\n${token.name} (${token.symbol})\n${token.address}\nPrice: $${price}\n\nEnter the amount to sell:`;
}

export function buyExecutedMessage(tokenName: string, tokenSymbol: string, amount: number): string {
  return `BUY ORDER EXECUTED\n\n${tokenName} (${tokenSymbol})\nAmount: ${amount} SOL\n\nPosition opened! Use Positions to track.`;
}

export function sellExecutedMessage(tokenName: string, tokenSymbol: string, amount: string): string {
  return `SELL ORDER EXECUTED\n\n${tokenName} (${tokenSymbol})\nAmount: ${amount}\n\nPosition closed!`;
}

// === STATUS / DISCONNECT ===
export function walletStatusMessage(wallets: Array<{ address: string; balance: number }>): string {
  let text = `WALLET STATUS\n\n`;
  for (let i = 0; i < wallets.length; i++) {
    text += `🟢 SOL Wallet ${i + 1}: ${wallets[i].balance.toFixed(6)} SOL\n${wallets[i].address}\n\n`;
  }
  return text;
}

export function walletDisconnectedMessage(address: string): string {
  return `Wallet Disconnected\n\n${address}\n\nYour wallet has been disconnected.`;
}

export function depositReceivedMessage(address: string, amount: number, newBalance: number): string {
  return `DEPOSIT RECEIVED\n\nWallet: ${address}\nAmount: ${amount.toFixed(6)} SOL\nNew Balance: ${newBalance.toFixed(6)} SOL`;
}

export function copyTargetAddedMessage(target: string): string {
  return `Added whale wallet to copy!\n${target}\n\nCopy trade is now monitoring this wallet.`;
}

export const robinhoodUnavailableMessage = () =>
  `🟢 Connect Robinhood\n\nRobinhood wallet connection is not available for Solana self-custody yet.\n\nUse 🟣 Add SOL Wallet or 🔑 Import to connect a Solana wallet.`;

export const chooseWalletPromptMessage = () => `Which connected wallet should execute this trade?`;
