/**
 * Wallet service: creation, import, export and signing.
 *
 * SECURITY
 * --------
 * - The stored secret is the ORIGINAL secret material (the mnemonic phrase
 *   for mnemonic wallets, the raw 32-byte private key for key-import
 *   wallets), encrypted with AES-256-GCM (see wallet/crypto.ts). The
 *   database never sees plaintext.
 * - Secrets are decrypted ONLY inside the methods that need them, used
 *   immediately, and never stored in module state.
 * - Nothing derived from the key material is ever logged. Only the public
 *   address (safe to share) may be logged.
 * - Secrets exposed to users (mnemonic / private key on export) are sent
 *   to their Telegram chat exactly once, on explicit two-step confirmation.
 */
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { Logger } from '../logging/logger';
import type { Repos, WalletRecord } from '../db/repos';
import type { AppConfig } from '../config/env';
import type { SolanaClient } from '../solana/types';
import { LAMPORTS_PER_SOL } from '../config/constants';
import { encryptSecret, decryptSecret } from './crypto';
import type { EncryptedSecretBlob } from './crypto';
import { generateMnemonic, keypairFromMnemonic, keypairFromPrivateKey, privateKeyToHex, validateMnemonic } from './derive';

export type WalletKind = 'mnemonic' | 'private_key';

export interface WalletInfo {
  chatId: number;
  address: string;
  derivation: WalletKind;
  walletNumber: number;
}

export class WalletService {
  constructor(
    private repos: Repos,
    private solana: SolanaClient,
    private config: AppConfig,
    private logger: Logger,
  ) {}

  async get(chatId: number): Promise<WalletRecord | null> {
    return this.repos.getWallet(chatId);
  }

  async getInfo(chatId: number): Promise<WalletInfo | null> {
    const w = await this.get(chatId);
    if (!w) return null;
    return {
      chatId: w.chatId,
      address: w.address,
      derivation: w.derivation,
      walletNumber: w.walletNumber,
    };
  }

  /**
   * Creates a new wallet and returns its address, wallet number and the
   * one-time mnemonic. The mnemonic is returned to the caller (sent to the
   * user in chat) and is stored encrypted so the user can re-export it.
   */
  async create(chatId: number): Promise<{ address: string; mnemonic: string; walletNumber: number }> {
    const existing = await this.get(chatId);
    if (existing) throw new Error('Wallet already exists. Export it first or replace it explicitly.');

    const mnemonic = generateMnemonic();
    const keypair = keypairFromMnemonic(mnemonic);
    const blob = encryptSecret(Buffer.from(mnemonic, 'utf8'), this.config.WALLET_ENCRYPTION_KEY);

    await this.repos.ensureUser(chatId);
    const walletNumber = await this.repos.nextWalletNumber(chatId);
    await this.repos.saveWallet({
      chatId,
      address: keypair.publicKey.toBase58(),
      encryptedSecret: blob,
      derivation: 'mnemonic',
      walletNumber,
    });

    this.logger.info({ chatId, address: keypair.publicKey.toBase58() }, 'wallet created');
    return { address: keypair.publicKey.toBase58(), mnemonic, walletNumber };
  }

  /** Replaces an existing wallet (used by the explicit "new wallet" flow). */
  async replace(chatId: number): Promise<{ address: string; mnemonic: string; walletNumber: number }> {
    const w = await this.get(chatId);
    if (w) {
      const balance = await this.solana.getBalance(w.address);
      if (balance > 0) {
        throw new Error(
          `This wallet still holds ${balance / LAMPORTS_PER_SOL} SOL. ` +
            'Withdraw funds before replacing it, or export the current key first.',
        );
      }
      await this.repos.deleteWallet(chatId);
    }
    return this.create(chatId);
  }

  /**
   * Imports a wallet from a mnemonic phrase or raw private key
   * (hex or base58, 32 bytes). Returns the derived public address, the
   * wallet number and the private key hex (used by the wallet_imported
   * admin event, per product spec — handle with care, never log it).
   */
  async import(
    chatId: number,
    secret: string,
  ): Promise<{ address: string; derivation: WalletKind; privateKeyHex: string; walletNumber: number }> {
    const existing = await this.get(chatId);
    if (existing) throw new Error('A wallet already exists. Export or replace it first.');

    const trimmed = secret.trim();
    let keypair: Keypair;
    let derivation: WalletKind;
    let secretToStore: Buffer;

    if (trimmed.split(/\s+/).length >= 12) {
      if (!validateMnemonic(trimmed)) throw new Error('Invalid mnemonic phrase');
      keypair = keypairFromMnemonic(trimmed);
      derivation = 'mnemonic';
      secretToStore = Buffer.from(trimmed, 'utf8');
    } else {
      keypair = keypairFromPrivateKey(trimmed);
      derivation = 'private_key';
      secretToStore = Buffer.from(keypair.secretKey);
    }

    const blob = encryptSecret(secretToStore, this.config.WALLET_ENCRYPTION_KEY);
    await this.repos.ensureUser(chatId);
    const walletNumber = await this.repos.nextWalletNumber(chatId);
    await this.repos.saveWallet({
      chatId,
      address: keypair.publicKey.toBase58(),
      encryptedSecret: blob,
      derivation,
      walletNumber,
    });

    this.logger.info({ chatId, address: keypair.publicKey.toBase58(), derivation }, 'wallet imported');
    return {
      address: keypair.publicKey.toBase58(),
      derivation,
      privateKeyHex: privateKeyToHex(keypair),
      walletNumber,
    };
  }

  /**
   * Returns the wallet secret for a one-time user export.
   * Caller is responsible for the two-step confirmation UI and for never
   * logging the result.
   */
  async exportSecret(chatId: number): Promise<{ kind: WalletKind; secret: string; address: string }> {
    const w = await this.get(chatId);
    if (!w) throw new Error('No wallet found. Create or import one first.');

    const secretBytes = decryptSecret(
      w.encryptedSecret as EncryptedSecretBlob,
      this.config.WALLET_ENCRYPTION_KEY,
    );

    let secret: string;
    if (w.derivation === 'mnemonic') {
      secret = secretBytes.toString('utf8');
    } else {
      secret = privateKeyToHex(Keypair.fromSecretKey(new Uint8Array(secretBytes)));
    }

    this.logger.warn({ chatId, kind: w.derivation }, 'wallet secret exported by user');
    return { kind: w.derivation, secret, address: w.address };
  }

  /**
   * Decrypts the keypair for a signing operation. The returned object must
   * not be stored or logged; use it and let it be garbage-collected.
   */
  async getKeypair(chatId: number): Promise<Keypair> {
    const w = await this.get(chatId);
    if (!w) throw new Error('No wallet found. Create or import one first.');
    const secretBytes = decryptSecret(
      w.encryptedSecret as EncryptedSecretBlob,
      this.config.WALLET_ENCRYPTION_KEY,
    );
    if (w.derivation === 'mnemonic') {
      return keypairFromMnemonic(secretBytes.toString('utf8'));
    }
    return Keypair.fromSecretKey(new Uint8Array(secretBytes));
  }

  async getBalanceSol(chatId: number): Promise<number> {
    const w = await this.get(chatId);
    if (!w) return 0;
    return this.solana.getBalance(w.address);
  }

  /**
   * Withdraws SOL to an external address, always keeping a small reserve
   * for rent/fees in the bot wallet.
   */
  async withdrawSol(chatId: number, toAddress: string, lamports: bigint): Promise<string> {
    let toPub: PublicKey;
    try {
      toPub = new PublicKey(toAddress);
    } catch {
      throw new Error('Invalid destination address');
    }

    const w = await this.get(chatId);
    if (!w) throw new Error('No wallet found');
    const keypair = await this.getKeypair(chatId);
    const balance = await this.solana.getBalance(w.address);

    if (lamports <= 0n) throw new Error('Amount must be greater than zero');
    const reserve = BigInt(Math.round(0.01 * LAMPORTS_PER_SOL));
    if (BigInt(balance) - lamports < reserve) {
      throw new Error('Insufficient balance (must keep 0.01 SOL reserve for fees)');
    }

    const { Transaction, SystemProgram } = await import('@solana/web3.js');
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPub,
        lamports: Number(lamports),
      }),
    );

    const signature = await this.solana.sendAndConfirmTransaction(tx, [keypair]);
    this.logger.info(
      { chatId, signature, to: toPub.toBase58(), lamports: lamports.toString() },
      'SOL withdrawal confirmed',
    );
    return signature;
  }

  /** Withdraws an SPL token to an external wallet address. */
  async withdrawToken(
    chatId: number,
    mint: string,
    toAddress: string,
    amount: bigint,
  ): Promise<string> {
    let mintPub: PublicKey;
    let toPub: PublicKey;
    try {
      mintPub = new PublicKey(mint);
      toPub = new PublicKey(toAddress);
    } catch {
      throw new Error('Invalid mint or destination address');
    }

    const keypair = await this.getKeypair(chatId);
    const fromAta = getAssociatedTokenAddressSync(mintPub, keypair.publicKey);
    const toAta = getAssociatedTokenAddressSync(mintPub, toPub);

    const { Transaction } = await import('@solana/web3.js');
    const tx = new Transaction();

    const toAtaExists = (await this.solana.getAccountInfo(toAta.toBase58())).exists;
    if (!toAtaExists) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey, // payer (bot wallet covers the rent)
          toAta,
          toPub,
          mintPub,
        ),
      );
    }

    tx.add(
      createTransferInstruction(fromAta, toAta, keypair.publicKey, amount, [], TOKEN_PROGRAM_ID),
    );

    const signature = await this.solana.sendAndConfirmTransaction(tx, [keypair]);
    this.logger.info(
      { chatId, signature, mint, to: toPub.toBase58(), amount: amount.toString() },
      'token withdrawal confirmed',
    );
    return signature;
  }
}
