/**
 * Jupiter market-data layer tests, using an injected fetch so no real
 * network is touched. Response shapes mirror the real Jupiter API.
 */
import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { JupiterPriceProvider, JupiterSwapProvider } from '../../src/market/jupiter';
import { WSOL_MINT } from '../../src/config/constants';
import { TEST_TOKEN_MINT } from '../helpers/fakes';

const silent = pino({ level: 'silent' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('market/JupiterPriceProvider', () => {
  it('parses real-shape price responses and maps WSOL -> SOL', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      expect(String(url)).toContain('ids=SOL');
      return jsonResponse({
        data: {
          SOL: { id: 'SOL', mintSymbol: 'SOL', vsToken: 'USDC', vsTokenSymbol: 'USDC', price: '150.42' },
        },
      });
    });
    const provider = new JupiterPriceProvider('https://price.example.com', silent, fetchFn as unknown as typeof fetch);
    const prices = await provider.getPrices([WSOL_MINT]);
    expect(prices[WSOL_MINT]).toBeCloseTo(150.42);
  });

  it('parses real-shape token price responses', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        data: {
          [TEST_TOKEN_MINT]: { id: TEST_TOKEN_MINT, price: '1.0001' },
        },
      }),
    );
    const provider = new JupiterPriceProvider('https://price.example.com', silent, fetchFn as unknown as typeof fetch);
    const prices = await provider.getPrices([TEST_TOKEN_MINT]);
    expect(prices[TEST_TOKEN_MINT]).toBeCloseTo(1.0001);
  });

  it('returns empty map for missing tokens and throws on HTTP errors', async () => {
    const ok = new JupiterPriceProvider('https://p.example.com', silent, (async () => jsonResponse({ data: {} })) as unknown as typeof fetch);
    expect(await ok.getPrices(['UnknownMint11111111111111111111111111111111111111'])).toEqual({});

    const failing = new JupiterPriceProvider(
      'https://p.example.com',
      silent,
      (async () => jsonResponse({ error: 'nope' }, 500)) as unknown as typeof fetch,
    );
    await expect(failing.getPrices([WSOL_MINT])).rejects.toThrow();
  });

  it('fetches SOL price via helper', async () => {
    const fetchFn = (async () =>
      jsonResponse({ data: { SOL: { id: 'SOL', price: '200' } } })) as unknown as typeof fetch;
    const provider = new JupiterPriceProvider('https://p.example.com', silent, fetchFn);
    expect(await provider.getSolPriceUsd()).toBe(200);
  });
});

describe('market/JupiterSwapProvider', () => {
  const quote = {
    inputMint: WSOL_MINT,
    outputMint: TEST_TOKEN_MINT,
    inAmount: '100000000',
    outAmount: '15000000',
    otherAmountThreshold: '14925000',
    swapMode: 'ExactIn',
    priceImpactPct: 0.4,
    slippageBps: 100,
  };

  it('builds quote requests with the right query parameters', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const u = new URL(String(url));
      expect(u.searchParams.get('inputMint')).toBe(WSOL_MINT);
      expect(u.searchParams.get('outputMint')).toBe(TEST_TOKEN_MINT);
      expect(u.searchParams.get('amount')).toBe('100000000');
      expect(u.searchParams.get('slippageBps')).toBe('100');
      return jsonResponse(quote);
    });
    const provider = new JupiterSwapProvider('https://quote.example.com/v6', silent, fetchFn as unknown as typeof fetch);
    const result = await provider.getQuote({
      inputMint: WSOL_MINT,
      outputMint: TEST_TOKEN_MINT,
      amount: '100000000',
      slippageBps: 100,
    });
    expect(result.outAmount).toBe('15000000');
    expect(result.swapMode).toBe('ExactIn');
  });

  it('rejects empty quotes (no route)', async () => {
    const fetchFn = (async () => jsonResponse({ error: 'no route' })) as unknown as typeof fetch;
    const provider = new JupiterSwapProvider('https://q.example.com', silent, fetchFn);
    await expect(
      provider.getQuote({ inputMint: WSOL_MINT, outputMint: TEST_TOKEN_MINT, amount: '1', slippageBps: 100 }),
    ).rejects.toThrow(/empty quote|failed/i);
  });

  it('builds a swap transaction POST with the owner address', async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/swap');
      const body = JSON.parse(String(init?.body));
      expect(body.userPublicKey).toBe('OwnerPubKey1111111111111111111111111111111111');
      expect(body.wrapAndUnwrapSol).toBe(true);
      expect(body.dynamicComputeUnitLimit).toBe(true);
      expect(body.quoteResponse.outputMint).toBe(TEST_TOKEN_MINT);
      return jsonResponse({ swapTransaction: 'base64tx===' });
    });
    const provider = new JupiterSwapProvider('https://q.example.com/v6', silent, fetchFn as unknown as typeof fetch);
    const tx = await provider.buildSwapTransaction(quote as never, 'OwnerPubKey1111111111111111111111111111111111', {
      wrapAndUnwrapSol: true,
    });
    expect(tx).toBe('base64tx===');
  });

  it('throws when Jupiter returns an error payload', async () => {
    const fetchFn = (async () => jsonResponse({ error: 'insufficient liquidity' })) as unknown as typeof fetch;
    const provider = new JupiterSwapProvider('https://q.example.com', silent, fetchFn);
    await expect(provider.buildSwapTransaction(quote as never, 'Owner')).rejects.toThrow(/insufficient liquidity/);
  });
});
