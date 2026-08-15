// tokens.js - Real token search via DexScreener API
const fetch = require('node-fetch');

const DEXSCREENER_API = 'https://api.dexscreener.com';

// Search for tokens by name/symbol/address
async function searchToken(query) {
  try {
    const url = `${DEXSCREENER_API}/latest/dex/search?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      return null;
    }
    
    // Get the first Solana pair (or first overall)
    const solPair = data.pairs.find(p => p.chainId === 'solana') || data.pairs[0];
    return parseTokenData(solPair);
  } catch (error) {
    console.error('Token search error:', error.message);
    return null;
  }
}

// Get token by contract address (Solana)
async function getTokenByAddress(address) {
  try {
    const url = `${DEXSCREENER_API}/tokens/v1/solana/${address}`;
    const resp = await fetch(url);
    const data = await resp.json();
    
    if (!data || data.length === 0) {
      // Try search
      return await searchToken(address);
    }
    
    return parseTokenData(data[0]);
  } catch (error) {
    console.error('Token lookup error:', error.message);
    return null;
  }
}

function parseTokenData(pair) {
  if (!pair) return null;
  
  const token = pair.baseToken || {};
  const liquidity = pair.liquidity || {};
  const volume = pair.volume || {};
  const priceChange = pair.priceChange || {};
  const txns = pair.txns || {};
  
  // Calculate risk level
  const liqUsd = liquidity.usd || 0;
  const vol24h = volume.h24 || 0;
  const mcap = pair.fdv || pair.marketCap || 0;
  const change24h = priceChange.h24 || 0;
  
  let riskLevel = 'UNKNOWN';
  let riskScore = 0;
  
  if (liqUsd > 100000) riskScore += 2;
  else if (liqUsd > 50000) riskScore += 1;
  
  if (vol24h > 50000) riskScore += 2;
  else if (vol24h > 10000) riskScore += 1;
  
  if (change24h > -20 && change24h < 200) riskScore += 1;
  
  if (riskScore >= 4) riskLevel = 'LOW RISK 🟢';
  else if (riskScore >= 2) riskLevel = 'MEDIUM RISK 🟡';
  else riskLevel = 'HIGH RISK 🔴';
  
  return {
    name: token.name || 'Unknown',
    symbol: token.symbol || '???',
    address: token.address || '',
    chain: pair.chainId || 'solana',
    dex: pair.dexId || 'unknown',
    price: pair.priceUsd || pair.priceNative || '0',
    priceUsd: parseFloat(pair.priceUsd || '0'),
    mcap: mcap,
    liquidity: liqUsd,
    volume24h: vol24h,
    change24h: change24h,
    change6h: priceChange.h6 || 0,
    change1h: priceChange.m5 || 0,
    txns24h: (txns.h24?.buys || 0) + (txns.h24?.sells || 0),
    buys24h: txns.h24?.buys || 0,
    sells24h: txns.h24?.sells || 0,
    pairAddress: pair.pairAddress || '',
    pairUrl: pair.url || '',
    riskLevel: riskLevel,
    createdAt: pair.pairCreatedAt || null
  };
}

// Format token info for display
function formatTokenInfo(token) {
  if (!token) return '❌ Token not found.';
  
  let formatted = `🎯 **${token.name} (${token.symbol})**\n`;
  formatted += `━━━━━━━━━━━━━━━━━━━━━\n`;
  formatted += `📌 **Contract:**\n\`${token.address}\`\n\n`;
  formatted += `💰 **Price:** $${token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6)}\n`;
  formatted += `📊 **Market Cap:** $${formatNumber(token.mcap)}\n`;
  formatted += `💧 **Liquidity:** $${formatNumber(token.liquidity)}\n`;
  formatted += `📈 **24h Volume:** $${formatNumber(token.volume24h)}\n`;
  formatted += `📊 **24h Change:** ${token.change24h >= 0 ? '📈' : '📉'} ${token.change24h.toFixed(2)}%\n`;
  formatted += `🔄 **24h Txns:** ${token.buys24h} buys / ${token.sells24h} sells\n`;
  formatted += `━━━━━━━━━━━━━━━━━━━━━\n`;
  formatted += `🛡 **Risk Analysis:** ${token.riskLevel}\n`;
  formatted += `🔗 **Dex:** ${token.dex}\n`;
  formatted += `🌐 [View on DexScreener](${token.pairUrl})\n`;
  
  return formatted;
}

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

module.exports = {
  searchToken,
  getTokenByAddress,
  formatTokenInfo,
  formatNumber
};
