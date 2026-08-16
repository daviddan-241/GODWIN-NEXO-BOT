/** Deposit snapshot diff logic tests (pure functions). */
import { describe, it, expect } from 'vitest';
import { diffSnapshots } from '../../src/deposits/monitor';
import { WSOL_MINT } from '../../src/config/constants';

describe('deposits/diffSnapshots', () => {
  it('detects a positive inflow', () => {
    const diffs = diffSnapshots(
      { [WSOL_MINT]: '1000000000' },
      { [WSOL_MINT]: '1500000000' },
    );
    expect(diffs).toEqual([{ mint: WSOL_MINT, delta: 500000000n }]);
  });

  it('detects a negative outflow', () => {
    const diffs = diffSnapshots(
      { [WSOL_MINT]: '1500000000' },
      { [WSOL_MINT]: '1000000000' },
    );
    expect(diffs).toEqual([{ mint: WSOL_MINT, delta: -500000000n }]);
  });

  it('detects a brand-new token mint', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const diffs = diffSnapshots({}, { [mint]: '250000' });
    expect(diffs).toEqual([{ mint, delta: 250000n }]);
  });

  it('detects a fully drained token account', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const diffs = diffSnapshots({ [mint]: '250000' }, {});
    expect(diffs).toEqual([{ mint, delta: -250000n }]);
  });

  it('returns nothing when balances are unchanged', () => {
    expect(diffSnapshots({ [WSOL_MINT]: '5' }, { [WSOL_MINT]: '5' })).toEqual([]);
  });

  it('handles huge 64-bit+ amounts via BigInt', () => {
    const big = '18446744073709551615000000000000';
    const diffs = diffSnapshots({ [WSOL_MINT]: '0' }, { [WSOL_MINT]: big });
    expect(diffs[0]?.delta).toBe(BigInt(big));
  });
});
