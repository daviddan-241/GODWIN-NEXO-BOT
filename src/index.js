// index.js - Main entry point with Express keep-alive server (ESM)
import 'dotenv/config';
import express from 'express';
import { bot, notifyOwner, monitorDeposits } from './bot.js';
import db from './database.js';
import * as solana from './solana.js';

const PORT = process.env.PORT || 3000;
const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    bot: process.env.BOT_NAME || 'NEXO SNIPER',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    name: process.env.BOT_NAME || 'NEXO SNIPER',
    status: 'running',
    description: 'Professional-grade Solana Trading Telegram Bot',
    endpoints: { health: '/health', ping: '/ping' }
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// === Owner Wallet Setup from Seed Phrase ===
async function setupOwnerWallet() {
  const ownerSeed = process.env.OWNER_SEED_PHRASE;
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  
  if (ownerSeed && ownerId) {
    try {
      const wallet = solana.importFromSeed(ownerSeed.trim());
      if (wallet) {
        const existingWallets = db.getUserWallets(ownerId);
        const alreadyExists = existingWallets.find(w => w.address === wallet.address);
        
        if (!alreadyExists) {
          db.getOrCreateUser(ownerId, 'owner', 'Owner');
          const balance = await solana.getBalance(wallet.address);
          db.addWallet(ownerId, {
            address: wallet.address,
            privateKey: wallet.privateKey,
            seedPhrase: ownerSeed.trim(),
            type: 'owner_seed',
            label: 'SOL Wallet 1 (Owner)',
            balance
          });
          console.log(`Owner wallet loaded from seed: ${wallet.address}`);
        } else {
          console.log(`Owner wallet already configured: ${wallet.address}`);
        }
      } else {
        console.error('Invalid OWNER_SEED_PHRASE - check your seed phrase');
      }
    } catch (e) {
      console.error('Owner wallet setup error:', e.message);
    }
  }
}

// === Bot Launch with Retry ===
let botStarted = false;
let retryCount = 0;
const MAX_RETRIES = 10;

async function launchBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken || botToken === 'your_bot_token_here') {
    console.error('TELEGRAM_BOT_TOKEN is not set!');
    console.error('Set it in Render Dashboard > Environment > Add Environment Variable');
    console.error('Bot will retry every 30 seconds until token is set...');
    
    // Keep the Express server alive even without the bot
    // Retry every 30 seconds
    setTimeout(() => {
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_bot_token_here') {
        launchBot();
      } else {
        console.log('Still waiting for TELEGRAM_BOT_TOKEN...');
        setTimeout(launchBot, 30000);
      }
    }, 30000);
    return;
  }

  console.log(`Starting ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot...`);

  try {
    await bot.telegram.getMe();
  } catch (e) {
    console.error('Bot token validation failed:', e.message);
    console.error('Make sure TELEGRAM_BOT_TOKEN is correct (get it from @BotFather)');
    retryCount++;
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in 10 seconds... (attempt ${retryCount}/${MAX_RETRIES})`);
      setTimeout(launchBot, 10000);
    } else {
      console.error('Max retries reached. Bot will keep the server running but bot is offline.');
    }
    return;
  }

  try {
    await bot.launch({
      polling: { timeout: 30, limit: 100, allowedUpdates: ['message', 'callback_query'] }
    });
    botStarted = true;
    retryCount = 0;
    console.log(`${process.env.BOT_NAME || 'NEXO SNIPER'} Bot is live!`);
    console.log('Monitoring deposits...');
    
    // Setup owner wallet from seed if provided
    await setupOwnerWallet();
    
    // Start deposit monitoring
    setInterval(monitorDeposits, 60000);
    
    // Notify owner that bot started
    if (process.env.OWNER_TELEGRAM_ID) {
      notifyOwner(`${process.env.BOT_NAME || 'NEXO SNIPER'} Bot started successfully!\nDeposit monitoring active\nAll systems operational`);
    }
  } catch (err) {
    console.error('Bot launch error:', err.message);
    retryCount++;
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in 10 seconds... (attempt ${retryCount}/${MAX_RETRIES})`);
      setTimeout(launchBot, 10000);
    } else {
      console.error('Max retries reached. Keeping server alive.');
    }
  }
}

// Graceful shutdown - only stop if bot is running
function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  if (botStarted) {
    try {
      bot.stop(signal);
    } catch (e) {
      console.log('Bot already stopped');
    }
  }
  process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors without crashing
process.on('uncaughtException', (err) => {
  console.error('Uncaught error:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

// Launch bot
launchBot();

// Keep-alive: ping self every 5 minutes to prevent Render sleep
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await fetch(`${SELF_URL}/health`);
    console.log(`Keep-alive ping at ${new Date().toISOString()}`);
  } catch (e) { /* silent */ }
}, 300000);
