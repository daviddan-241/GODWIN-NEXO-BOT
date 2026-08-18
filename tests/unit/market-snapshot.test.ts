/** Market-snapshot provider tests (mocked fetch, real response shapes). */
import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { CoinGeckoMarket } from '../../src/market/coingecko';

const silent = pino({ level: 'silent' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const CONFIG = {
  coingecko: 'https://coingecko.test/api/v3',
  binance: 'https://binance.test',
  jupiter: 'https://jup.test/price/v2',
};

describe('market snapshot (CoinGecko -> Binance -> Jupiter)', () => {
  it('parses real CoinGecko prices + 24h changes', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      expect(String(url)).toContain('include_24hr_change=true');
      return jsonResponse({
        solana: { usd: 76.95, usd_24h_change: 1.44 },
        ethereum: { usd: 1911.95, usd_24h_change: 0.26 },
        binancecoin: { usd: 602.41, usd_24h_change: -0.53 },
      });
    });
    const market = new CoinGeckoMarket(CONFIG.coingecko, silent, fetchFn as unknown as typeof fetch, CONFIG.jupiter, CONFIG.binance);
    const prices = await market.getMarketPrices();
    expect(prices.SOL.price).toBeCloseTo(76.95);
    expect(prices.SOL.change).toBeCloseTo(1.44);
    expect(prices.ETH.price).toBeCloseTo(1911.95);
    expect(prices.BNB.price).toBeCloseTo(602.41);
    expect(prices.BNB.change).toBeCloseTo(-0.53);
  });

  it('falls back to Binance 24hr tickers when CoinGecko fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('coingecko.test')) return jsonResponse({}, 429);
      if (u.includes('binance.test')) {
        return jsonResponse([
          { symbol: 'SOLUSDC', lastPrice: '77.10', priceChangePercent: '2.5' },
          { symbol: 'ETHUSDC', lastPrice: '1920.00', priceChangePercent: '-0.4' },
          { symbol: 'BNBUSDC', lastPrice: '600.00', priceChangePercent: '0.8' },
        ]);
      }
      return jsonResponse({}, 500);
    });
    const market = new CoinGeckoMarket(CONFIG.coingecko, silent, fetchFn as unknown as typeof fetch, CONFIG.jupiter, CONFIG.binance);
    const prices = await market.getMarketPrices();
    expect(prices.SOL.price).toBeCloseTo(77.10);
    expect(prices.SOL.change).toBeCloseTo(2.5);
    expect(prices.ETH.price).toBeCloseTo(1920.0);
    expect(prices.ETH.change).toBeCloseTo(-0.4);
    expect(prices.BNB.price).toBeCloseTo(600.0);
  });

  it('falls back to Jupiter SOL-only when everything else fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('coingecko.test')) return jsonResponse({}, 429);
      if (u.includes('binance.test')) return jsonResponse({ code: -1 }, 451);
      if (u.includes('jup.test')) return jsonResponse({ data: { SOL: { price: '76.5' } } });
      return jsonResponse({}, 500);
    });
    const market = new CoinGeckoMarket(CONFIG.coingecko, silent, fetchFn as unknown as typeof fetch, CONFIG.jupiter, CONFIG.binance);
    const prices = await market.getMarketPrices();
    expect(prices.SOL.price).toBeCloseTo(76.5);
    expect(prices.ETH.price).toBe(0); // honest "n/a" rendering, never fake
    expect(prices.BNB.price).toBe(0);
  });

  it('caches results for 60s', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      return jsonResponse({
        solana: { usd: 70, usd_24h_change: 1 },
        ethereum: { usd: 1800, usd_24h_change: 1 },
        binancecoin: { usd: 500, usd_24h_change: 1 },
      });
    });
    const market = new CoinGeckoMarket(CONFIG.coingecko, silent, fetchFn as unknown as typeof fetch, CONFIG.jupiter, CONFIG.binance);
    await market.getMarketPrices();
    await market.getMarketPrices();
    expect(calls).toBe(1);
  });
});
