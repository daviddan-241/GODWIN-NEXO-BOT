/**
 * Jupiter API client — the production market-data and swap provider.
 *
 * Quotes and prices come from the live Jupiter aggregator (real DEX
 * liquidity across Solana). Swap transactions are built by Jupiter's
 * swap API and signed locally with the bot's wallet before being sent to
 * the RPC — Jupiter never sees the private key.
 */
import type { Logger } from '../logging/logger';
import { WSOL_MINT } from '../config/constants';
import { retryWithBackoff } from '../util/retry';
import type {
  PriceProvider,
  QuoteParams,
  QuoteResult,
  SwapBuildOptions,
  SwapProvider,
} from './types';

type FetchFn = typeof fetch;

export interface JupiterPriceResponse {
  data?: Record<string, { id?: string; price?: string }>;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: number;
}

export interface JupiterSwapResponse {
  swapTransaction?: string;
  error?: string;
}

export class JupiterPriceProvider implements PriceProvider {
  private cache = new Map<string, { price: number; at: number }>();
  private cacheTtlMs = 30_000;

  constructor(
    private apiUrl: string,
    private logger: Logger,
    private fetchFn: FetchFn = fetch,
  ) {}

  async getPrices(mints: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const toFetch: string[] = [];
    const now = Date.now();

    for (const mint of mints) {
      const cached = this.cache.get(mint);
      if (cached && now - cached.at < this.cacheTtlMs) {
        out[mint] = cached.price;
      } else {
        toFetch.push(mint);
      }
    }

    if (toFetch.length > 0) {
      const jupiterIds = toFetch.map((m) => (m === WSOL_MINT ? 'SOL' : m));
      const url = `${this.apiUrl}?ids=${jupiterIds.map(encodeURIComponent).join(',')}`;
      const res = await retryWithBackoff(() => this.fetchFn(url), {
        retries: 2,
        onRetry: (err, attempt) =>
          this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter price retry'),
      });
      if (!res.ok) throw new Error(`Jupiter price API error: HTTP ${res.status}`);

      const body = (await res.json()) as JupiterPriceResponse;
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

  async getSolPriceUsd(): Promise<number> {
    const prices = await this.getPrices([WSOL_MINT]);
    const sol = prices[WSOL_MINT];
    if (!sol) throw new Error('Unable to fetch SOL price from Jupiter');
    return sol;
  }
}

export class JupiterSwapProvider implements SwapProvider {
  constructor(
    private apiUrl: string,
    private logger: Logger,
    private fetchFn: FetchFn = fetch,
  ) {}

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const qs = new URLSearchParams({
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps: String(params.slippageBps),
    });
    const url = `${this.apiUrl}/quote?${qs.toString()}`;

    const res = await retryWithBackoff(() => this.fetchFn(url), {
      retries: 2,
      onRetry: (err, attempt) =>
        this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter quote retry'),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jupiter quote failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as JupiterQuoteResponse;
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

  async buildSwapTransaction(
    quote: QuoteResult,
    ownerAddress: string,
    options: SwapBuildOptions = {},
  ): Promise<string> {
  const payload = {
    quoteResponse: quote,
    userPublicKey: ownerAddress,
    wrapAndUnwrapSol: options.wrapAndUnwrapSol ?? true,
    dynamicComputeUnitLimit: options.dynamicComputeUnitLimit ?? true,
    prioritizationFeeLamports: options.prioritizationFeeLamports ?? undefined,
  };

    const res = await retryWithBackoff(
      () =>
        this.fetchFn(`${this.apiUrl}/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      {
        retries: 2,
        onRetry: (err, attempt) =>
          this.logger.warn({ attempt, err: err instanceof Error ? err.message : String(err) }, 'jupiter swap retry'),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Jupiter swap API failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as JupiterSwapResponse;
    if (!body.swapTransaction) {
      throw new Error(`Jupiter did not return a transaction: ${body.error ?? 'unknown error'}`);
    }
    return body.swapTransaction;
  }
}
