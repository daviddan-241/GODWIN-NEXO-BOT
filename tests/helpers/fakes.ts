/**
 * Test doubles for the external layers (RPC, prices, swaps, admin
 * transport). These are used ONLY by tests — production wiring in
 * src/app.ts always uses the real implementations.
 */
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { SolanaClient, TokenAccountInfo, MintInfo, TxLike } from '../../src/solana/types';
import type { PriceProvider, QuoteParams, QuoteResult, SwapBuildOptions, SwapProvider } from '../../src/market/types';
import type { TokenSearchProvider, TokenInfo } from '../../src/market/token-resolver';
import type { AdminTransport } from '../../src/admin/transport';
import { WSOL_MINT } from '../../src/config/constants';

export class FakeSolanaClient implements SolanaClient {
  balances = new Map<string, number>();
  tokenAccounts = new Map<string, TokenAccountInfo[]>();
  mints = new Map<string, MintInfo>();
  existingAccounts = new Set<string>();
  sentTransactions: TxLike[] = [];
  sendResult = 'fake-signature-000000000000000000000000000000000000000000000000000000000000';
  /** Recent signatures per address (for deposit-meta lookups). */
  signatures = new Map<string, Array<{ signature: string; err: boolean | null }>>();
  /** Sender per signature. */
  senders = new Map<string, string>();
  /** Fake slot counter. */
  slot = 200_000_000;
  /** Preconfigured swap-signal results per signature. */
  swapSignals = new Map<string, import('../../src/solana/swap-signals').ParsedSwapResult | null>();

  async getSlot(): Promise<number> {
    this.slot += 400;
    return this.slot;
  }

  async getSwapSignals(signature: string): Promise<import('../../src/solana/swap-signals').ParsedSwapResult | null> {
    return this.swapSignals.get(signature) ?? null;
  }

  async getHealth(): Promise<string> {
    return 'ok';
  }
  async getRecentSignatures(
    address: string,
    limit = 5,
  ): Promise<Array<{ signature: string; err: boolean | null }>> {
    return (this.signatures.get(address) ?? []).slice(0, limit);
  }
  async getTransactionSender(signature: string): Promise<string | null> {
    return this.senders.get(signature) ?? null;
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

/**
 * In-memory DexScreener double. Tokens are registered by address/symbol;
 * lookups return real-shaped TokenInfo objects.
 */
export class FakeTokenSearch implements TokenSearchProvider {
  tokensByAddress = new Map<string, TokenInfo>();
  tokensBySymbol = new Map<string, TokenInfo>();
  failAll = false;

  register(token: TokenInfo): void {
    this.tokensByAddress.set(token.address, token);
    this.tokensBySymbol.set(token.symbol.toLowerCase(), token);
  }

  makeToken(overrides: Partial<TokenInfo> = {}): TokenInfo {
    return {
      name: 'Bonk',
      symbol: 'BONK',
      address: OTHER_TOKEN_MINT,
      chain: 'solana',
      dex: 'raydium',
      priceUsd: 0.00002,
      mcap: 500_000,
      liquidity: 150_000,
      volume24h: 80_000,
      change24h: 5.2,
      buys24h: 1200,
      sells24h: 900,
      pairUrl: 'https://dexscreener.com/solana/fake',
      riskLevel: 'LOW RISK',
      riskScore: 810,
      riskFlags: [],
      flagDetails: [],
      tradeable: true,
      ...overrides,
    };
  }

  async searchToken(query: string): Promise<TokenInfo | null> {
    if (this.failAll) return null;
    return this.tokensBySymbol.get(query.toLowerCase()) ?? null;
  }

  async getTokenByAddress(address: string): Promise<TokenInfo | null> {
    if (this.failAll) return null;
    return this.tokensByAddress.get(address) ?? null;
  }
}
