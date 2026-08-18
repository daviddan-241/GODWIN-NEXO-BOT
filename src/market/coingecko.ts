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
    /** Fallback 1: Jupiter price API (SOL at minimum). */
    private jupiterPriceUrl = 'https://api.jup.ag/price/v2',
    /** Fallback 2: Binance 24hr tickers (price + real 24h change). */
    private binanceUrl = 'https://api.binance.com',
  ) {}

  async getMarketPrices(): Promise<MarketPrices> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cacheTtlMs) return this.cache.data;

    // 1) CoinGecko — full SOL/ETH/BNB prices AND 24h changes.
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
      if (prices.SOL.price > 0 || prices.ETH.price > 0 || prices.BNB.price > 0) {
        this.cache = { data: prices, at: now };
        return prices;
      }
      throw new Error('CoinGecko returned empty prices');
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'coingecko fetch failed');
    }

    // 2) Binance 24hr tickers — real prices + real 24h changes.
    const binance = await this.binanceFallback();
    if (binance && (binance.SOL.price > 0 || binance.ETH.price > 0 || binance.BNB.price > 0)) {
      this.cache = { data: binance, at: now };
      return binance;
    }

    // 3) Jupiter — SOL price only (ETH/BNB show n/a until a source works).
    const fallback = await this.jupiterFallback();
    this.cache = { data: fallback, at: now };
    return fallback;
  }

  private async binanceFallback(): Promise<MarketPrices | null> {
    try {
      const symbols = encodeURIComponent('["SOLUSDC","ETHUSDC","BNBUSDC"]');
      const res = await this.fetchFn(`${this.binanceUrl}/api/v3/ticker/24hr?symbols=${symbols}`);
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
      const data = (await res.json()) as Array<{
        symbol?: string;
        lastPrice?: string;
        priceChangePercent?: string;
      }>;
      if (!Array.isArray(data)) return null;
      const find = (s: string) => data.find((t) => t.symbol === s);
      const toNum = (v?: string): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const prices: MarketPrices = {
        SOL: { price: toNum(find('SOLUSDC')?.lastPrice), change: toNum(find('SOLUSDC')?.priceChangePercent) },
        ETH: { price: toNum(find('ETHUSDC')?.lastPrice), change: toNum(find('ETHUSDC')?.priceChangePercent) },
        BNB: { price: toNum(find('BNBUSDC')?.lastPrice), change: toNum(find('BNBUSDC')?.priceChangePercent) },
      };
      return prices;
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'binance fallback failed');
      return null;
    }
  }

  private async jupiterFallback(): Promise<MarketPrices> {
    try {
      const res = await this.fetchFn(`${this.jupiterPriceUrl}?ids=SOL`);
      if (!res.ok) throw new Error(`Jupiter price HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Record<string, { price?: string }> };
      const sol = parseFloat(body.data?.SOL?.price ?? '0');
      if (!Number.isFinite(sol)) throw new Error('Jupiter SOL price missing');
      return {
        SOL: { price: sol, change: 0 },
        ETH: { price: 0, change: 0 },
        BNB: { price: 0, change: 0 },
      };
    } catch {
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
