/**
 * Test doubles for the external layers (RPC, prices, swaps, admin
 * transport). These are used ONLY by tests — production wiring in
 * src/app.ts always uses the real implementations.
 */
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { SolanaClient, TokenAccountInfo, MintInfo, TxLike } from '../../src/solana/types';
import type { PriceProvider, QuoteParams, QuoteResult, SwapBuildOptions, SwapProvider } from '../../src/market/types';
import type { AdminTransport } from '../../src/admin/transport';
import { WSOL_MINT } from '../../src/config/constants';

export class FakeSolanaClient implements SolanaClient {
  balances = new Map<string, number>();
  tokenAccounts = new Map<string, TokenAccountInfo[]>();
  mints = new Map<string, MintInfo>();
  existingAccounts = new Set<string>();
  sentTransactions: TxLike[] = [];
  sendResult = 'fake-signature-000000000000000000000000000000000000000000000000000000000000';

  async getHealth(): Promise<string> {
    return 'ok';
  }
  async getBalance(pubkey: string): Promise<number> {
    return this.balances.get(pubkey) ?? 0;
  }
  async getParsedTokenAccountsByOwner(owner: string): Promise<TokenAccountInfo[]> {
    return this.tokenAccounts.get(owner) ?? [];
  }
  async getMintInfo(mint: string): Promise<MintInfo> {
    const info = this.mints.get(mint);
    if (!info) throw new Error(`Not an SPL mint: ${mint}`);
    return info;
  }
  async getAccountInfo(address: string): Promise<{ exists: boolean }> {
    return { exists: this.existingAccounts.has(address) };
  }
  async sendAndConfirmTransaction(tx: TxLike): Promise<string> {
    this.sentTransactions.push(tx);
    return this.sendResult;
  }
  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return { blockhash: PublicKey.default.toString(), lastValidBlockHeight: 1000 };
  }
}

export class FakePriceProvider implements PriceProvider {
  prices: Record<string, number> = {};
  constructor() {
    this.prices[WSOL_MINT] = 150;
  }
  async getPrices(mints: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const m of mints) {
      const p = this.prices[m];
      if (p !== undefined) out[m] = p;
    }
    return out;
  }
  async getSolPriceUsd(): Promise<number> {
    return this.prices[WSOL_MINT] ?? 150;
  }
}

export const TEST_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC mint (well-known)
export const OTHER_TOKEN_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'; // BONK mint (well-known)

export class FakeSwapProvider implements SwapProvider {
  quotes: QuoteResult[] = [];
  lastQuote: QuoteResult | null = null;
  quoteImpl?: (params: QuoteParams) => Promise<QuoteResult>;

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    if (this.quoteImpl) return this.quoteImpl(params);
    const quote = this.quotes.shift();
    if (quote) {
      this.lastQuote = quote;
      return { ...quote, slippageBps: params.slippageBps };
    }
    // Sticky: the executor re-quotes at execution time with the same
    // parameters, so reuse the last served quote when the queue is empty.
    if (this.lastQuote) {
      return { ...this.lastQuote, slippageBps: params.slippageBps };
    }
    throw new Error('FakeSwapProvider: no quote configured');
  }

  async buildSwapTransaction(_quote: QuoteResult, ownerAddress: string, _options?: SwapBuildOptions): Promise<string> {
    // Build a REAL (offline) versioned transaction so the executor's
    // deserialize + sign + serialize path is genuinely exercised.
    // Like real Jupiter swap transactions, the owner is the fee payer
    // (and therefore a required signer); the executor signs it locally.
    const owner = new PublicKey(ownerAddress);
    const msg = new TransactionMessage({
      payerKey: owner,
      recentBlockhash: PublicKey.default.toString(),
      instructions: [],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    return Buffer.from(tx.serialize()).toString('base64');
  }
}

export function makeQuote(overrides: Partial<QuoteResult> = {}): QuoteResult {
  return {
    inputMint: WSOL_MINT,
    outputMint: TEST_TOKEN_MINT,
    inAmount: '100000000', // 0.1 SOL
    outAmount: '15000000', // 15 USDC
    otherAmountThreshold: '14925000',
    swapMode: 'ExactIn',
    priceImpactPct: 0.5,
    slippageBps: 100,
    ...overrides,
  };
}

export class FakeAdminTransport implements AdminTransport {
  messages: Array<{ chatId: number; text: string }> = [];
  failCount = 0;

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (this.failCount > 0) {
      this.failCount--;
      throw new Error('transient transport failure');
    }
    this.messages.push({ chatId, text });
  }
}
