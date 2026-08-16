/**
 * Solana RPC layer types. The app depends on this interface, never on
 * `Connection` directly — which makes the RPC layer replaceable and lets
 * the test suite run against a local JSON-RPC test double.
 */
import type { Transaction, VersionedTransaction, Signer } from '@solana/web3.js';

export interface TokenAccountInfo {
  mint: string;
  amount: string; // raw base units
  decimals: number;
  uiAmount: number | null;
  /** The token account's own address (optional — SPL deposit reporting). */
  account?: string;
}

export interface MintInfo {
  decimals: number;
  isInitialized: boolean;
}

export interface AccountExistsInfo {
  exists: boolean;
}

export type TxLike = Transaction | VersionedTransaction;

export interface SolanaClient {
  /** RPC `getHealth` — returns "ok" when the node is healthy. */
  getHealth(): Promise<string>;
  /** SOL balance in lamports. */
  getBalance(pubkey: string): Promise<number>;
  /** All SPL token accounts owned by `owner`. */
  getParsedTokenAccountsByOwner(owner: string): Promise<TokenAccountInfo[]>;
  /** Mint metadata (decimals etc.). Throws if the account is not a mint. */
  getMintInfo(mint: string): Promise<MintInfo>;
  /** Account existence check (used for ATA rent decisions). */
  getAccountInfo(address: string): Promise<AccountExistsInfo>;
  /**
   * Sends a transaction and waits for confirmation at the configured
   * commitment. Returns the transaction signature.
   */
  sendAndConfirmTransaction(tx: TxLike, signers?: Signer[]): Promise<string>;
  /** Latest blockhash (used by tests/verification). */
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
  /** Current slot (deposit reporting). */
  getSlot(): Promise<number>;
  /**
   * Recent transaction signatures for an address (best-effort; used by the
   * deposit monitor to enrich deposit events with tx info).
   */
  getRecentSignatures(
    address: string,
    limit?: number,
  ): Promise<Array<{ signature: string; err: boolean | null }>>;
  /**
   * Best-effort sender extraction for a transaction signature: the fee
   * payer (or first external signer) of the transaction, or null when the
   * transaction cannot be parsed or the sender is the address itself.
   */
  getTransactionSender(signature: string, selfAddress: string): Promise<string | null>;
}
