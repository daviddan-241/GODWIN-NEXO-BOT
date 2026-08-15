// index.js - Main entry point with Express keep-alive server (ESM)
import 'dotenv/config';
import express from 'express';
import { bot } from './bot.js';

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

console.log(`🤖 Starting ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot...`);

process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });

bot.launch({
  polling: { timeout: 30, limit: 100, allowedUpdates: ['message', 'callback_query'] }
})
.then(() => {
  console.log(`✅ ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot is live!`);
  console.log('📊 Monitoring deposits...');
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
