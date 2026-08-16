/** Trading safety layer tests (mainnet gate + caps). */
import { describe, it, expect } from 'vitest';
import { assertNetworkAllowsTrading, assertTradeAmount, clampSlippageBps, TradingSafetyError } from '../../src/trading/safety';
import { makeConfig } from '../helpers/test-env';

describe('trading/safety', () => {
  it('allows trading on devnet', () => {
    const config = makeConfig();
    expect(() => assertNetworkAllowsTrading(config)).not.toThrow();
  });

  it('BLOCKS mainnet trading without the explicit flag', () => {
    const config = makeConfig({ SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'false' });
    expect(() => assertNetworkAllowsTrading(config)).toThrow(TradingSafetyError);
    expect(() => assertNetworkAllowsTrading(config)).toThrow(/disabled/);
  });

  it('allows mainnet trading with the explicit flag', () => {
    const config = makeConfig({ SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'true' });
    expect(() => assertNetworkAllowsTrading(config)).not.toThrow();
  });

  it('enforces the per-trade cap', () => {
    const config = makeConfig({ TRADING_MAX_SOL_PER_TRADE: '1' });
    expect(() => assertTradeAmount(1_000_000_000, config)).not.toThrow(); // 1 SOL ok
    expect(() => assertTradeAmount(1_000_000_001, config)).toThrow(/cap/);
  });

  it('enforces the minimum trade size', () => {
    const config = makeConfig();
    expect(() => assertTradeAmount(999_999, config)).toThrow(/too small/);
    expect(() => assertTradeAmount(1_000_000, config)).not.toThrow(); // 0.001 SOL
  });

  it('clamps slippage bounds', () => {
    expect(clampSlippageBps(100)).toBe(100);
    expect(() => clampSlippageBps(5)).toThrow(/too low/);
    expect(() => clampSlippageBps(3001)).toThrow(/too high/);
    expect(() => clampSlippageBps(Number.NaN)).toThrow();
  });
});
