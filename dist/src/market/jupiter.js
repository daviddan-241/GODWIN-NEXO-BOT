"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JupiterSwapProvider = exports.JupiterPriceProvider = void 0;
const constants_1 = require("../config/constants");
const retry_1 = require("../util/retry");
class JupiterPriceProvider {
    apiUrl;
    logger;
    fetchFn;
    cache = new Map();
    cacheTtlMs = 30_000;
    constructor(apiUrl, logger, fetchFn = fetch) {
        this.apiUrl = apiUrl;
        this.logger = logger;
        this.fetchFn = fetchFn;
    }
    async getPrices(mints) {
        const out = {};
        const toFetch = [];
        const now = Date.now();
        for (const mint of mints) {
            const cached = this.cache.get(mint);
            if (cached && now - cached.at < this.cacheTtlMs) {
                out[mint] = cached.price;
            }
            else {
                toFetch.push(mint);
            }
        }
        if (toFetch.length > 0) {
            const jupiterIds = toFetch.map((m) => (m === constants_1.WSOL_MINT ? 'SOL' : m));
            const url = `${this.apiUrl}?ids=${jupiterIds.map(encodeURIComponent).join(',')}`;
            const res = await (0, retry_1.retryWithBackoff)(() => this.fetchFn(url), {
                retries: 2,
                onRetry: (err, attempt) => this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter price retry'),
            });
            if (!res.ok)
                throw new Error(`Jupiter price API error: HTTP ${res.status}`);
            const body = (await res.json());
            toFetch.forEach((mint, i) => {
                const id = jupiterIds[i];
                const priceStr = body.data?.[id]?.price;
                const price = priceStr !== undefined ? Number(priceStr) : NaN;
                if (Number.isFinite(price) && price > 0) {
                    out[mint] = price;
                    this.cache.set(mint, { price, at: now });
                }
            });
        }
        return out;
    }
    async getSolPriceUsd() {
        const prices = await this.getPrices([constants_1.WSOL_MINT]);
        const sol = prices[constants_1.WSOL_MINT];
        if (!sol)
            throw new Error('Unable to fetch SOL price from Jupiter');
        return sol;
    }
}
exports.JupiterPriceProvider = JupiterPriceProvider;
class JupiterSwapProvider {
    apiUrl;
    logger;
    fetchFn;
    constructor(apiUrl, logger, fetchFn = fetch) {
        this.apiUrl = apiUrl;
        this.logger = logger;
        this.fetchFn = fetchFn;
    }
    async getQuote(params) {
        const qs = new URLSearchParams({
            inputMint: params.inputMint,
            outputMint: params.outputMint,
            amount: params.amount,
            slippageBps: String(params.slippageBps),
        });
        const url = `${this.apiUrl}/quote?${qs.toString()}`;
        const res = await (0, retry_1.retryWithBackoff)(() => this.fetchFn(url), {
            retries: 2,
            onRetry: (err, attempt) => this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter quote retry'),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Jupiter quote failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
        }
        const body = (await res.json());
        if (!body.outAmount || !body.inAmount) {
            throw new Error('Jupiter returned an empty quote (no route for this pair?)');
        }
        return {
            inputMint: body.inputMint,
            outputMint: body.outputMint,
            inAmount: body.inAmount,
            outAmount: body.outAmount,
            otherAmountThreshold: body.otherAmountThreshold,
            swapMode: body.swapMode === 'ExactOut' ? 'ExactOut' : 'ExactIn',
            priceImpactPct: body.priceImpactPct ?? 0,
            slippageBps: body.slippageBps ?? params.slippageBps,
        };
    }
    async buildSwapTransaction(quote, ownerAddress, options = {}) {
        const payload = {
            quoteResponse: quote,
            userPublicKey: ownerAddress,
            wrapAndUnwrapSol: options.wrapAndUnwrapSol ?? true,
            dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
            prioritizationFeeLamports: options.prioritizationFeeLamports ?? undefined,
        };
        const res = await (0, retry_1.retryWithBackoff)(() => this.fetchFn(`${this.apiUrl}/swap`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }), {
            retries: 2,
            onRetry: (err, attempt) => this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter swap retry'),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Jupiter swap API failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
        }
        const body = (await res.json());
        if (!body.swapTransaction) {
            throw new Error(`Jupiter did not return a transaction: ${body.error ?? 'unknown error'}`);
        }
        return body.swapTransaction;
    }
}
exports.JupiterSwapProvider = JupiterSwapProvider;
//# sourceMappingURL=jupiter.js.map