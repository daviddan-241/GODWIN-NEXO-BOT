/**
 * Real Solana RPC client backed by @solana/web3.js `Connection`.
 *
 * All blockchain data flows through here. There is no simulation anywhere:
 * balances, token accounts, mint info, transactions and confirmations all
 * come from a live RPC endpoint (devnet by default, mainnet only with the
 * explicit mainnet gate enabled — see config/env.ts and trading/safety.ts).
 */
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Signer,
  type Commitment,
  type Finality,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { retryWithBackoff } from '../util/retry';
import { parseSwapSignals } from './swap-signals';
import type { SolanaClient, TokenAccountInfo, MintInfo, AccountExistsInfo } from './types';


export interface SolanaClientOptions {
  rpcUrl: string;
  commitment: Commitment;
}

interface ParsedTokenAccountValue {
  mint: string;
  tokenAmount: { amount: string; decimals: number; uiAmount: number | null };
}

export class ConnectionSolanaClient implements SolanaClient {
  private connection: Connection;

  constructor(private options: SolanaClientOptions) {
    this.connection = new Connection(options.rpcUrl, {
      commitment: options.commitment,
      confirmTransactionInitialTimeout: 90_000,
    });
  }

  async getHealth(): Promise<string> {
    // Direct JSON-RPC getHealth call (Connection.getHealth is not exposed
    // in this web3.js line; the raw RPC call is equivalent).
    const res = await fetch(this.options.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RPC getHealth failed: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: string; error?: { message?: string } };
    if (body.error) throw new Error(`RPC getHealth failed: ${body.error.message ?? 'unknown'}`);
    if (body.result !== 'ok') throw new Error(`RPC getHealth returned: ${body.result ?? 'empty'}`);
    return body.result;
  }

  async getBalance(pubkey: string): Promise<number> {
    return this.connection.getBalance(new PublicKey(pubkey));
  }

  async getParsedTokenAccountsByOwner(owner: string): Promise<TokenAccountInfo[]> {
    const res = await retryWithBackoff(
      () =>
        this.connection.getParsedTokenAccountsByOwner(
          new PublicKey(owner),
          { programId: TOKEN_PROGRAM_ID },
          this.options.commitment,
        ),
      { retries: 3, onRetry: (err, attempt) => {
        // network hiccups are common; retried silently at debug level
        void err;
        void attempt;
      } },
    );

    return res.value.map((item) => {
      const info = item.account.data.parsed.info as ParsedTokenAccountValue;
      return {
        mint: info.mint,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount,
        account: item.pubkey.toBase58(),
      };
    });
  }

  async getMintInfo(mint: string): Promise<MintInfo> {
    const pubkey = new PublicKey(mint);
    const account = await this.connection.getParsedAccountInfo(pubkey);
    const data = account.value?.data;

    if (!data || Buffer.isBuffer(data)) {
      throw new Error(`Address is not an SPL token mint: ${mint}`);
    }
    if (data.program !== 'spl-token' || !('parsed' in data)) {
      throw new Error(`Address is not an SPL token mint: ${mint}`);
    }
    const parsed = data.parsed as { type?: string; info?: { decimals?: number; isInitialized?: boolean } };
    if (parsed.type !== 'mint' || !parsed.info) {
      throw new Error(`Address is not an SPL token mint: ${mint}`);
    }
    return {
      decimals: parsed.info.decimals ?? 0,
      isInitialized: parsed.info.isInitialized ?? true,
    };
  }

  async getAccountInfo(address: string): Promise<AccountExistsInfo> {
    const info = await this.connection.getAccountInfo(new PublicKey(address));
    return { exists: info !== null };
  }

  async sendAndConfirmTransaction(tx: Transaction | VersionedTransaction, signers: Signer[] = []): Promise<string> {
    let signature: string;
    if (tx instanceof VersionedTransaction) {
      signature = await this.connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
    } else {
      signature = await this.connection.sendTransaction(tx, signers, {
        skipPreflight: false,
        maxRetries: 3,
      });
    }

    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.options.commitment);
    const confirmation = await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      this.options.commitment,
    );
    if (confirmation.value.err) {
      throw new Error(
        `Transaction failed to confirm: ${JSON.stringify(confirmation.value.err)}`,
      );
    }
    return signature;
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.options.commitment);
    return { blockhash, lastValidBlockHeight };
  }

  async getSlot(): Promise<number> {
    return this.connection.getSlot(this.options.commitment);
  }

  async getSwapSignals(signature: string): Promise<import('./swap-signals').ParsedSwapResult | null> {
    try {
      const parsed = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: this.options.commitment as Finality,
      });
      if (!parsed) return null;
      return parseSwapSignals(parsed, signature);
    } catch {
      return null; // best-effort
    }
  }

  async getRecentSignatures(
    address: string,
    limit = 5,
  ): Promise<Array<{ signature: string; err: boolean | null }>> {
    const res = await this.connection.getSignaturesForAddress(
      new PublicKey(address),
      { limit },
      this.options.commitment as Finality,
    );
    return res.map((item) => ({
      signature: item.signature,
      err: item.err ? true : null,
    }));
  }

  async getTransactionSender(signature: string, selfAddress: string): Promise<string | null> {
    try {
      const parsed = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: this.options.commitment as Finality,
      });
      const message = parsed?.transaction?.message;
      if (!message || !('accountKeys' in message)) return null;

      const keys = message.accountKeys as Array<{ pubkey: unknown; signer?: boolean }>;
      const toBase58 = (p: unknown): string | null => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && 'toBase58' in p) {
          return (p as { toBase58(): string }).toBase58();
        }
        return null;
      };

      // The fee payer is the first account key; prefer the first external
      // signer when the fee payer is the wallet itself.
      const first = keys[0] ? toBase58(keys[0].pubkey) : null;
      if (first && first !== selfAddress) return first;
      for (const key of keys) {
        if (!key.signer) continue;
        const pub = toBase58(key.pubkey);
        if (pub && pub !== selfAddress) return pub;
      }
      return null;
    } catch {
      return null; // best-effort only
    }
  }
}
