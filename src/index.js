// index.js - Main entry point with Express keep-alive server
require('dotenv').config();

const express = require('express');
const { bot } = require('./bot');

const PORT = process.env.PORT || 3000;

// Express server for keep-alive (UptimeRobot + Render)
const app = express();

// Health check endpoint for Render and UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    bot: process.env.BOT_NAME || 'NEXO SNIPER',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'GODWIN NEXO BOT',
    status: 'running',
    description: 'Professional-grade Solana Trading Telegram Bot',
    endpoints: {
      health: '/health',
      ping: '/ping'
    }
  });
});

// Ping endpoint for UptimeRobot
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

// Start Express server
app.listen(PORT, () => {
  console.log(`✅ Express server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Start Telegram bot
console.log(`🤖 Starting ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot...`);

// Enable graceful stop
process.once('SIGINT', () => {
  console.log('SIGINT received, stopping...');
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  console.log('SIGTERM received, stopping...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// Launch bot with polling (works on Render free tier without webhook URL)
bot.launch({
  polling: {
    timeout: 30,
    limit: 100,
    allowedUpdates: ['message', 'callback_query']
  }
})
.then(() => {
  console.log(`✅ ${process.env.BOT_NAME || 'NEXO SNIPER'} Bot is live!`);
  console.log('📊 Monitoring deposits...');
})
.catch((err) => {
  console.error('❌ Bot launch error:', err);
  
  // Retry after 5 seconds
  setTimeout(() => {
    console.log('🔄 Retrying bot launch...');
    bot.launch().catch(e => console.error('Retry failed:', e.message));
  }, 5000);
});

// Keep-alive: ping self every 5 minutes to prevent sleep on Render
const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
setInterval(async () => {
  try {
    const fetch = require('node-fetch');
    await fetch(`${SELF_URL}/health`);
    console.log(`💗 Keep-alive ping sent at ${new Date().toISOString()}`);
  } catch (e) {
    // Silent fail
  }
}, 300000); // 5 minutes
