/**
 * Multi-provider token resolver tests (mocked fetch, real parsing paths).
 */
import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { MultiProviderTokenResolver, deriveRisk } from '../../src/market/token-resolver';
import { TEST_TOKEN_MINT } from '../helpers/fakes';

const silent = pino({ level: 'silent' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const CONFIG = {
  coingeckoUrl: 'https://coingecko.test/api/v3',
  dexscreenerUrl: 'https://dexscreener.test',
  raydiumPriceUrl: 'https://raydium.test/mint/price',
  birdeyeUrl: 'https://birdeye.test',
  jupiterTokenListUrl: 'https://jup.test/strict',
};

describe('market/token-resolver', () => {
  it('resolves a token by address from Jupiter list + Raydium price when DexScreener fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('jup.test')) {
        return jsonResponse({
          tokens: [{ address: TEST_TOKEN_MINT, symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
        });
      }
      if (u.includes('raydium.test')) {
        return jsonResponse({ data: { [TEST_TOKEN_MINT]: { mintSymbol: 'USDC', price: 1.0001 } } });
      }
      if (u.includes('dexscreener.test') || u.includes('coingecko.test') || u.includes('birdeye.test')) {
        return jsonResponse({}, 500);
      }
      return jsonResponse({}, 404);
    });

    const resolver = new MultiProviderTokenResolver(CONFIG, silent, fetchFn as unknown as typeof fetch);
    const token = await resolver.getTokenByAddress(TEST_TOKEN_MINT);
    expect(token).not.toBeNull();
    expect(token!.symbol).toBe('USDC');
    expect(token!.priceUsd).toBeCloseTo(1.0001);
    expect(token!.riskLevel).toMatch(/RISK$/);
    expect(token!.riskScore).toBeGreaterThanOrEqual(0);
    expect(token!.riskScore).toBeLessThanOrEqual(1000);
  });

  it('searches by symbol across providers and falls back to the Jupiter list address', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('jup.test')) {
        return jsonResponse({
          tokens: [{ address: TEST_TOKEN_MINT, symbol: 'BONK', name: 'Bonk', decimals: 5 }],
        });
      }
      if (u.includes('dexscreener.test') && u.includes('/search')) {
        return jsonResponse({ pairs: [] }); // DexScreener has nothing
      }
      if (u.includes('raydium.test')) {
        return jsonResponse({ data: { [TEST_TOKEN_MINT]: { mintSymbol: 'BONK', price: 0.00002 } } });
      }
      return jsonResponse({}, 500);
    });

    const resolver = new MultiProviderTokenResolver(CONFIG, silent, fetchFn as unknown as typeof fetch);
    const token = await resolver.searchToken('bonk');
    expect(token).not.toBeNull();
    expect(token!.symbol).toBe('BONK');
    expect(token!.address).toBe(TEST_TOKEN_MINT);
  });

  it('returns null only when EVERY provider fails', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500));
    const resolver = new MultiProviderTokenResolver(CONFIG, silent, fetchFn as unknown as typeof fetch);
    expect(await resolver.searchToken('zzzdoesnotexist')).toBeNull();
    expect(await resolver.getTokenByAddress(TEST_TOKEN_MINT)).toBeNull();
  });

  it('merges DexScreener market data with list metadata', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('jup.test')) {
        return jsonResponse({ tokens: [{ address: TEST_TOKEN_MINT, symbol: 'USDC', name: 'USD Coin' }] });
      }
      if (u.includes('/tokens/v1/solana/')) {
        return jsonResponse([
          {
            chainId: 'solana',
            dexId: 'raydium',
            pairAddress: 'pair',
            url: 'https://dexscreener.com/solana/pair',
            priceUsd: '1.00',
            fdv: 60_000_000,
            liquidity: { usd: 2_000_000 },
            volume: { h24: 500_000 },
            priceChange: { h24: 0.5 },
            txns: { h24: { buys: 3000, sells: 2800 } },
            baseToken: { name: 'USD Coin', symbol: 'USDC', address: TEST_TOKEN_MINT },
          },
        ]);
      }
      return jsonResponse({}, 500);
    });

    const resolver = new MultiProviderTokenResolver(CONFIG, silent, fetchFn as unknown as typeof fetch);
    const token = await resolver.getTokenByAddress(TEST_TOKEN_MINT);
    expect(token).not.toBeNull();
    expect(token!.liquidity).toBe(2_000_000);
    expect(token!.volume24h).toBe(500_000);
    expect(token!.mcap).toBe(60_000_000);
    expect(token!.dex).toBe('raydium');
    expect(token!.riskLevel).toBe('LOW RISK');
    expect(token!.riskFlags).toEqual([]);
  });

  it('flags risky tokens and keeps scores within 0-1000', () => {
    const risky = deriveRisk({ liquidity: 500, volume24h: 100, mcap: 0, buys24h: 5, sells24h: 3 });
    expect(risky.riskLevel).toBe('HIGH RISK');
    expect(risky.riskFlags).toContain('RUG RISK');
    expect(risky.riskScore).toBeGreaterThanOrEqual(0);
    expect(risky.riskScore).toBeLessThanOrEqual(1000);

    const safe = deriveRisk({ liquidity: 5_000_000, volume24h: 2_000_000, mcap: 100_000_000, buys24h: 5000, sells24h: 4500 });
    expect(safe.riskLevel).toBe('LOW RISK');
    expect(safe.riskScore).toBeLessThanOrEqual(1000);
  });
});
