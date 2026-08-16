/**
 * Market-data layer interfaces. Production implementations use the public
 * Jupiter APIs (real on-chain DEX data); tests inject doubles that
 * implement the same interfaces.
 */

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  /** Raw amount in the input token's base units. */
  amount: string;
  slippageBps: number;
}

export interface QuoteResult {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  priceImpactPct: number;
  slippageBps: number;
}

export interface SwapBuildOptions {
  wrapAndUnwrapSol?: boolean;
  prioritizationFeeLamports?: number;
  dynamicComputeUnitLimit?: boolean;
}

export interface SwapProvider {
  getQuote(params: QuoteParams): Promise<QuoteResult>;
  /** Returns a base64-encoded transaction ready to be signed by the bot wallet. */
  buildSwapTransaction(
    quote: QuoteResult,
    ownerAddress: string,
    options?: SwapBuildOptions,
  ): Promise<string>;
}

export interface PriceProvider {
  /**
   * Returns USD prices keyed by mint address.
   * The wrapped-SOL mint is accepted and mapped to the native SOL price.
   */
  getPrices(mints: string[]): Promise<Record<string, number>>;
  getSolPriceUsd(): Promise<number>;
}
