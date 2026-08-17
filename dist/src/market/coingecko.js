"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinGeckoMarket = void 0;
exports.formatPrice = formatPrice;
exports.formatChange = formatChange;
const retry_1 = require("../util/retry");
const EMPTY_PRICES = {
    SOL: { price: 0, change: 0 },
    ETH: { price: 0, change: 0 },
    BNB: { price: 0, change: 0 },
};
class CoinGeckoMarket {
    apiUrl;
    logger;
    fetchFn;
    jupiterPriceUrl;
    cache = null;
    cacheTtlMs = 60_000;
    constructor(apiUrl, logger, fetchFn = fetch, 
    /** Fallback: Jupiter price API (SOL at minimum) when CoinGecko is rate-limited. */
    jupiterPriceUrl = 'https://api.jup.ag/price/v2') {
        this.apiUrl = apiUrl;
        this.logger = logger;
        this.fetchFn = fetchFn;
        this.jupiterPriceUrl = jupiterPriceUrl;
    }
    async getMarketPrices() {
        const now = Date.now();
        if (this.cache && now - this.cache.at < this.cacheTtlMs)
            return this.cache.data;
        try {
            const url = `${this.apiUrl}/simple/price?ids=solana,ethereum,binancecoin` +
                `&vs_currencies=usd&include_24hr_change=true`;
            const res = await (0, retry_1.retryWithBackoff)(() => this.fetchFn(url), {
                retries: 2,
                onRetry: (err, attempt) => this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'coingecko retry'),
            });
            if (!res.ok)
                throw new Error(`CoinGecko HTTP ${res.status}`);
            const data = (await res.json());
            const prices = {
                SOL: { price: data.solana?.usd ?? 0, change: data.solana?.usd_24h_change ?? 0 },
                ETH: { price: data.ethereum?.usd ?? 0, change: data.ethereum?.usd_24h_change ?? 0 },
                BNB: { price: data.binancecoin?.usd ?? 0, change: data.binancecoin?.usd_24h_change ?? 0 },
            };
            this.cache = { data: prices, at: now };
            return prices;
        }
        catch (err) {
            this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'coingecko fetch failed');
            // Fallback: real SOL price from the Jupiter price API (ETH/BNB show
            // 0 when unavailable — the terminal renders them as-is).
            const fallback = await this.jupiterFallback();
            this.cache = { data: fallback, at: now };
            return fallback;
        }
    }
    async jupiterFallback() {
        try {
            const res = await this.fetchFn(`${this.jupiterPriceUrl}?ids=SOL`);
            if (!res.ok)
                throw new Error(`Jupiter price HTTP ${res.status}`);
            const body = (await res.json());
            const sol = parseFloat(body.data?.SOL?.price ?? '0');
            if (!Number.isFinite(sol))
                throw new Error('Jupiter SOL price missing');
            return {
                SOL: { price: sol, change: 0 },
                ETH: { price: 0, change: 0 },
                BNB: { price: 0, change: 0 },
            };
        }
        catch {
            return this.cache?.data ?? EMPTY_PRICES;
        }
    }
}
exports.CoinGeckoMarket = CoinGeckoMarket;
function formatPrice(price) {
    if (price >= 1000)
        return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1)
        return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
}
function formatChange(change) {
    const arrow = change >= 0 ? '📈' : '📉';
    return `${arrow} ${Math.abs(change).toFixed(2)}%`;
}
//# sourceMappingURL=coingecko.js.map