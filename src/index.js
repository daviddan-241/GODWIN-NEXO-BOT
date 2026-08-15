// index.js - Main entry point with Express keep-alive server (ESM)
import 'dotenv/config';
import express from 'express';
import { bot, notifyOwner } from './bot.js';
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
    name: 'GODWIN NEXO BOT',
    status: 'running',
    description: 'Professional-grade Solana Trading Telegram Bot',
    endpoints: { health: '/health', ping: '/ping' }
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => {
  console.log(`✅ Express server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// === Owner Wallet Setup from Seed Phrase ===
async function setupOwnerWallet() {
  const ownerSeed = process.env.OWNER_SEED_PHRASE;
  const ownerId = process.env.OWNER_TELEGRAM_ID;
  
  if (ownerSeed && ownerId) {
    const wallet = solana.importFromSeed(ownerSeed.trim());
    if (wallet) {
      // Check if wallet already exists
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
        console.log(`✅ Owner wallet loaded from seed: ${wallet.address}`);
      } else {
        console.log(`✅ Owner wallet already configured: ${wallet.address}`);
      }
    } else {
      console.error('❌ Invalid OWNER_SEED_PHRASE - check your seed phrase');
    }
  }
}

console.log(`🤖 Starting ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot...`);

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

// Launch bot
bot.launch({
  polling: { timeout: 30, limit: 100, allowedUpdates: ['message', 'callback_query'] }
})
.then(async () => {
  console.log(`✅ ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot is live!`);
  console.log('📊 Monitoring deposits...');
  
  // Setup owner wallet from seed if provided
  await setupOwnerWallet();
  
  // Notify owner that bot started
  if (process.env.OWNER_TELEGRAM_ID) {
    notifyOwner(`🤖 ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot started successfully!\n✅ Deposit monitoring active\n✅ All systems operational`);
  }
})
.catch((err) => {
  console.error('❌ Bot launch error:', err);
  setTimeout(() => {
    console.log('🔄 Retrying bot launch...');
    bot.launch().catch(e => console.error('Retry failed:', e.message));
  }, 5000);
});

// Keep-alive: ping self every 5 minutes to prevent Render sleep
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    await fetch(`${SELF_URL}/health`);
    console.log(`💗 Keep-alive ping sent at ${new Date().toISOString()}`);
  } catch (e) { /* silent */ }
}, 300000);
