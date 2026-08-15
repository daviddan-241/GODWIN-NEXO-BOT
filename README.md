# GODWIN NEXO BOT 🤖⚡

Professional-grade Solana Trading Telegram Bot

## Features

- 💰 **Wallet Management** - Generate, import (private key & seed phrase), check balances, withdraw
- 🤖 **AI Sniper** - Automated trading with configurable position size, dev hold %, slippage, priority fee, take profit, stop loss, anti-rug
- 🔍 **Token Search** - Search any Solana token via DexScreener API with real risk analysis
- 📈 **Positions** - Track open trading positions
- 💸 **Buy/Sell** - Buy tokens with SOL/USDC, sell tokens
- 🔁 **Copy Trade** - Copy trades from whale wallets
- 💬 **Help** - Full command reference
- 📊 **Market Data** - Live SOL, ETH, BNB prices from CoinGecko
- 🔔 **Owner Notifications** - New users, deposits, trades, withdrawals

## Real Integrations

- **Solana Blockchain** - Real wallet generation, balance checking, and SOL transfers via `@solana/web3.js`
- **CoinGecko API** - Live market prices for SOL, ETH, BNB
- **DexScreener API** - Real token search and data
- **Telegram Bot API** - Full bot with inline keyboards, callbacks, state management

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your bot token and owner ID
```

### 3. Run locally
```bash
npm start
```

## Deploy to Render (Free)

1. Fork/push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Runtime:** Node
   - **Plan:** Free
   - **Build:** `npm install`
   - **Start:** `node src/index.js`
   - **Health Check:** `/health`
5. Add environment variables:
   - `TELEGRAM_BOT_TOKEN` - Your bot token from @BotFather
   - `OWNER_TELEGRAM_ID` - Your Telegram user ID (from @userinfobot)
   - `SOLANA_RPC_URL` - `https://api.mainnet-beta.solana.com` (default)

## Keep Alive with UptimeRobot

1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add new monitor → HTTP(s)
3. URL: `https://your-app.onrender.com/health`
4. Interval: 5 minutes
5. This prevents Render free tier from sleeping

## Bot Commands

| Command | Description |
|---------|-------------|
| /start | Start the bot |
| /menu | Main dashboard |
| /wallet | Wallet management |
| /sniper | AI Sniper settings |
| /copytrade | Copy trading |
| /buysell | Buy/Sell tokens |
| /positions | View positions |
| /search | Search tokens |
| /help | Help message |

## Architecture

```
src/
├── index.js       - Express server + bot launch
├── bot.js         - All Telegram bot handlers
├── keyboards.js   - Inline keyboard definitions
├── messages.js    - Message templates
├── solana.js      - Solana blockchain integration
├── market.js      - CoinGecko price data
├── tokens.js      - DexScreener token search
└── database.js    - File-based persistence
```

## Security

- Wallet private keys are stored locally in the data directory
- All connections use Solana's mainnet RPC
- Bank-grade encryption messaging
- Read-only wallet connections

## License

MIT
