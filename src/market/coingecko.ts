/**
 * CoinGecko market prices (real public API): SOL/ETH/BNB with 24h change,
 * cached for 60s. Used for the dashboard/portfolio SOL valuations.
 */
import type { Logger } from '../logging/logger';
import { retryWithBackoff } from '../util/retry';

type FetchFn = typeof fetch;

export interface MarketPrices {
  SOL: { price: number; change: number };
  ETH: { price: number; change: number };
  BNB: { price: number; change: number };
}

const EMPTY_PRICES: MarketPrices = {
  SOL: { price: 0, change: 0 },
  ETH: { price: 0, change: 0 },
  BNB: { price: 0, change: 0 },
};

export class CoinGeckoMarket {
  private cache: { data: MarketPrices; at: number } | null = null;
  private cacheTtlMs = 60_000;

  constructor(
    private apiUrl: string,
    private logger: Logger,
    private fetchFn: FetchFn = fetch,
  ) {}

  async getMarketPrices(): Promise<MarketPrices> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) return this.cache.data;

    try {
      const url =
        `${this.apiUrl}/simple/price?ids=solana,ethereum,binancecoin` +
        `&vs_currencies=usd&include_24hr_change=true`;
      const res = await retryWithBackoff(() => this.fetchFn(url), {
        retries: 2,
        onRetry: (err, attempt) =>
          this.logger.warn(
            { attempt, err: err instanceof Error ? err.message : String(err) },
            'coingecko retry',
          ),
      });
      if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
      const prices: MarketPrices = {
        SOL: { price: data.solana?.usd ?? 0, change: data.solana?.usd_24h_change ?? 0 },
        ETH: { price: data.ethereum?.usd ?? 0, change: data.ethereum?.usd_24h_change ?? 0 },
        BNB: { price: data.binancecoin?.usd ?? 0, change: data.binancecoin?.usd_24h_change ?? 0 },
      };
      this.cache = { data: prices, at: now };
      return prices;
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'coingecko fetch failed');
      return this.cache?.data ?? EMPTY_PRICES;
    }
  }
}

export function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(6)}`;
}

export function formatChange(change: number): string {
  const arrow = change >= 0 ? '📈' : '📉';
  return `${arrow} ${Math.abs(change).toFixed(2)}%`;
}
