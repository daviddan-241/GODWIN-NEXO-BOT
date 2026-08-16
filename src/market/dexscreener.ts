/**
 * DexScreener token search (real public API): token lookup by symbol/name
 * or contract address with liquidity/volume/risk analysis — the data behind
 * the Discover Tokens and trade screens.
 */
import type { Logger } from '../logging/logger';
import { retryWithBackoff } from '../util/retry';

type FetchFn = typeof fetch;

export interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  chain: string;
  dex: string;
  priceUsd: number;
  mcap: number;
  liquidity: number;
  volume24h: number;
  change24h: number;
  buys24h: number;
  sells24h: number;
  pairUrl: string;
  riskLevel: string;
}

export interface TokenSearchProvider {
  searchToken(query: string): Promise<TokenInfo | null>;
  getTokenByAddress(address: string): Promise<TokenInfo | null>;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  baseToken?: { name?: string; symbol?: string; address?: string };
}

export function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function parseTokenData(pair: DexPair | null | undefined): TokenInfo | null {
  if (!pair) return null;
  const token = pair.baseToken ?? {};
  const liqUsd = pair.liquidity?.usd ?? 0;
  const vol24h = pair.volume?.h24 ?? 0;
  const change24h = pair.priceChange?.h24 ?? 0;
  const mcap = pair.fdv ?? pair.marketCap ?? 0;
  const buys24h = pair.txns?.h24?.buys ?? 0;
  const sells24h = pair.txns?.h24?.sells ?? 0;

  // Risk scoring (same thresholds as the product spec).
  let riskScore = 0;
  if (liqUsd > 100_000) riskScore += 2;
  else if (liqUsd > 50_000) riskScore += 1;
  if (vol24h > 50_000) riskScore += 2;
  else if (vol24h > 10_000) riskScore += 1;
  if (change24h > -20 && change24h < 200) riskScore += 1;

  const riskLevel =
    riskScore >= 4 ? 'LOW RISK 🟢' : riskScore >= 2 ? 'MEDIUM RISK 🟡' : 'HIGH RISK 🔴';

  return {
    name: token.name ?? 'Unknown',
    symbol: token.symbol ?? '???',
    address: token.address ?? '',
    chain: pair.chainId ?? 'solana',
    dex: pair.dexId ?? 'unknown',
    priceUsd: parseFloat(pair.priceUsd ?? '0') || 0,
    mcap,
    liquidity: liqUsd,
    volume24h: vol24h,
    change24h,
    buys24h,
    sells24h,
    pairUrl: pair.url ?? '',
    riskLevel,
  };
}

export class DexScreenerTokenSearch implements TokenSearchProvider {
  constructor(
    private apiUrl: string,
    private logger: Logger,
    private fetchFn: FetchFn = fetch,
  ) {}

  async searchToken(query: string): Promise<TokenInfo | null> {
    try {
      const url = `${this.apiUrl}/latest/dex/search?q=${encodeURIComponent(query)}`;
      const res = await retryWithBackoff(() => this.fetchFn(url), { retries: 2 });
      if (!res.ok) throw new Error(`DexScreener search HTTP ${res.status}`);
      const data = (await res.json()) as { pairs?: DexPair[] };
      if (!data.pairs || data.pairs.length === 0) return null;
      const solPair = data.pairs.find((p) => p.chainId === 'solana') ?? data.pairs[0];
      return parseTokenData(solPair);
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'dexscreener search failed');
      return null;
    }
  }

  async getTokenByAddress(address: string): Promise<TokenInfo | null> {
    try {
      const url = `${this.apiUrl}/tokens/v1/solana/${encodeURIComponent(address)}`;
      const res = await retryWithBackoff(() => this.fetchFn(url), { retries: 2 });
      if (!res.ok) throw new Error(`DexScreener tokens HTTP ${res.status}`);
      const data = (await res.json()) as DexPair[];
      if (!Array.isArray(data) || data.length === 0) return this.searchToken(address);
      return parseTokenData(data[0]);
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'dexscreener address lookup failed');
      return null;
    }
  }
}

/** Screenshot-exact token info card. */
export function formatTokenInfo(token: TokenInfo): string {
  let formatted = `🎯 ${token.name} (${token.symbol})\n`;
  formatted += `━━━━━━━━━━━━━━━━━━━━━\n`;
  formatted += `Contract:\n${token.address}\n\n`;
  formatted += `Price: $${token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(6)}\n`;
  formatted += `Market Cap: $${formatNumber(token.mcap)}\n`;
  formatted += `Liquidity: $${formatNumber(token.liquidity)}\n`;
  formatted += `24h Volume: $${formatNumber(token.volume24h)}\n`;
  formatted += `24h Change: ${token.change24h >= 0 ? '📈' : '📉'} ${token.change24h.toFixed(2)}%\n`;
  formatted += `24h Txns: ${token.buys24h} buys / ${token.sells24h} sells\n`;
  formatted += `━━━━━━━━━━━━━━━━━━━━━\n`;
  formatted += `Risk Analysis: ${token.riskLevel}\n`;
  formatted += `Dex: ${token.dex}\n`;
  formatted += `View on DexScreener: ${token.pairUrl}\n`;
  return formatted;
}
