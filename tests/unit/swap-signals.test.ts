/** Real swap-signal parser tests (synthetic parsed-transaction shapes). */
import { describe, it, expect } from 'vitest';
import { parseSwapSignals } from '../../src/solana/swap-signals';

function parsedTxFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    blockTime: 1755420000,
    meta: {
      err: null,
      preBalances: [1_000_000_000, 0],
      postBalances: [900_000_000, 0],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: 'Mint1111111111111111111111111111111111111111',
          uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: 'Mint1111111111111111111111111111111111111111',
          uiTokenAmount: { amount: '7500000', decimals: 6, uiAmount: 7.5 },
        },
      ],
    },
    transaction: {
      message: { accountKeys: [{ pubkey: 'wallet' }, { pubkey: 'ata' }] },
    },
    ...overrides,
  };
}

describe('solana/swap-signals', () => {
  it('detects a BUY (token inflow + SOL outflow)', () => {
    const result = parseSwapSignals(parsedTxFixture(), 'sigA');
    expect(result.ok).toBe(true);
    expect(result.blockTime).toBe(1755420000);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].direction).toBe('buy');
    expect(result.signals[0].mint).toBe('Mint1111111111111111111111111111111111111111');
    expect(result.signals[0].tokenAmountRaw).toBe('7500000');
    expect(result.signals[0].decimals).toBe(6);
  });

  it('detects a SELL (token outflow)', () => {
    const fixture = parsedTxFixture();
    const meta = fixture.meta as Record<string, unknown>;
    meta.preTokenBalances = [
      {
        accountIndex: 1,
        mint: 'Mint1111111111111111111111111111111111111111',
        uiTokenAmount: { amount: '5000000', decimals: 6, uiAmount: 5 },
      },
    ];
    meta.postTokenBalances = [
      {
        accountIndex: 1,
        mint: 'Mint1111111111111111111111111111111111111111',
        uiTokenAmount: { amount: '0', decimals: 6, uiAmount: 0 },
      },
    ];
    const result = parseSwapSignals(fixture, 'sigB');
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].direction).toBe('sell');
    expect(result.signals[0].tokenAmountRaw).toBe('5000000');
  });

  it('marks failed transactions', () => {
    const result = parseSwapSignals(
      parsedTxFixture({ meta: { err: { InstructionError: [0, 'Custom'] }, preBalances: [1], postBalances: [1], preTokenBalances: [], postTokenBalances: [] } }),
      'sigC',
    );
    expect(result.ok).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('handles null/malformed inputs gracefully', () => {
    expect(parseSwapSignals(null, 'x').signals).toEqual([]);
    expect(parseSwapSignals({}, 'x').signals).toEqual([]);
    expect(parseSwapSignals({ meta: {}, transaction: {} }, 'x').signals).toEqual([]);
  });

  it('ignores unchanged token balances', () => {
    const fixture = parsedTxFixture();
    const meta = fixture.meta as Record<string, unknown>;
    meta.preTokenBalances = [
      {
        accountIndex: 1,
        mint: 'Mint1111111111111111111111111111111111111111',
        uiTokenAmount: { amount: '7500000', decimals: 6, uiAmount: 7.5 },
      },
    ];
    const result = parseSwapSignals(fixture, 'sigD');
    expect(result.signals).toHaveLength(0);
  });
});
