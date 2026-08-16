/**
 * Trading safety layer.
 *
 * MAINNET SAFETY
 * --------------
 * Real mainnet transactions are possible ONLY when BOTH
 *   SOLANA_NETWORK=mainnet AND SOLANA_MAINNET_ENABLED=true
 * are set. There is no code path that can place a mainnet transaction
 * without this explicit configuration, and devnet trading is on by default
 * for development. On top of that, per-trade and slippage caps are
 * enforced here — the single choke point every trade must pass through.
 */
import type { AppConfig } from '../config/env';
import {
  MAX_SLIPPAGE_BPS,
  MIN_SLIPPAGE_BPS,
  MIN_TRADE_LAMPORTS,
} from '../config/constants';

export class TradingSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TradingSafetyError';
  }
}

export function assertNetworkAllowsTrading(config: AppConfig): void {
  if (config.SOLANA_NETWORK === 'devnet') return; // devnet trading always allowed
  if (config.tradingAllowed) return;
  throw new TradingSafetyError(
    'Mainnet trading is disabled. Set SOLANA_NETWORK=mainnet AND SOLANA_MAINNET_ENABLED=true to enable real transactions.',
  );
}

export function assertTradeAmount(lamports: number | bigint, config: AppConfig): void {
  const amount = BigInt(lamports);
  if (amount < BigInt(MIN_TRADE_LAMPORTS)) {
    throw new TradingSafetyError(
      `Trade amount too small (minimum ${MIN_TRADE_LAMPORTS / 1_000_000} SOL).`,
    );
  }
  if (amount > BigInt(Math.floor(config.maxTradeLamports))) {
    throw new TradingSafetyError(
      `Trade amount exceeds the per-trade cap of ${config.TRADING_MAX_SOL_PER_TRADE} SOL.`,
    );
  }
}

export function clampSlippageBps(bps: number): number {
  if (!Number.isFinite(bps) || bps < MIN_SLIPPAGE_BPS) {
    throw new TradingSafetyError(`Slippage too low (minimum ${MIN_SLIPPAGE_BPS / 100}%).`);
  }
  if (bps > MAX_SLIPPAGE_BPS) {
    throw new TradingSafetyError(`Slippage too high (maximum ${MAX_SLIPPAGE_BPS / 100}%).`);
  }
  return Math.round(bps);
}
