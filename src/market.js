// market.js - Real market price data from CoinGecko
const fetch = require('node-fetch');

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// Cache prices for 60 seconds
let priceCache = { data: null, timestamp: 0 };

async function getMarketPrices() {
  const now = Date.now();
  if (priceCache.data && (now - priceCache.timestamp) < 60000) {
    return priceCache.data;
  }

  try {
    const url = `${COINGECKO_API}/simple/price?ids=solana,ethereum,binancecoin&vs_currencies=usd&include_24hr_change=true`;
    const resp = await fetch(url);
    const data = await resp.json();
    
    const prices = {
      SOL: {
        price: data.solana?.usd || 0,
        change: data.solana?.usd_24h_change || 0
      },
      ETH: {
        price: data.ethereum?.usd || 0,
        change: data.ethereum?.usd_24h_change || 0
      },
      BNB: {
        price: data.binancecoin?.usd || 0,
        change: data.binancecoin?.usd_24h_change || 0
      }
    };
    
    priceCache = { data: prices, timestamp: now };
    return prices;
  } catch (error) {
    console.error('Market data error:', error.message);
    // Return cached data if available, otherwise fallback
    return priceCache.data || {
      SOL: { price: 0, change: 0 },
      ETH: { price: 0, change: 0 },
      BNB: { price: 0, change: 0 }
    };
  }
}

// Get SOL price specifically
async function getSolPrice() {
  const prices = await getMarketPrices();
  return prices.SOL.price;
}

// Format price for display
function formatPrice(price) {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(6)}`;
}

// Format change percentage with arrow
function formatChange(change) {
  const arrow = change >= 0 ? '📈' : '📉';
  return `${arrow} ${Math.abs(change).toFixed(2)}%`;
}

module.exports = {
  getMarketPrices,
  getSolPrice,
  formatPrice,
  formatChange
};
