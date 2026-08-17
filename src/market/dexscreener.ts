/**
 * Backwards-compatible re-export of the token search layer.
 * The multi-provider resolver lives in market/token-resolver.ts
 * (DexScreener + CoinGecko + Raydium + Birdeye + Jupiter).
 */
export type { TokenInfo, TokenSearchProvider } from './token-resolver';
export { formatTokenInfo } from './token-resolver';

export function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}
