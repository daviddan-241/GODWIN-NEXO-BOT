"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
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
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const constants_1 = require("../config/constants");
const crypto_1 = require("./crypto");
const derive_1 = require("./derive");
class WalletService {
    repos;
    solana;
    config;
    logger;
    constructor(repos, solana, config, logger) {
        this.repos = repos;
        this.solana = solana;
        this.config = config;
        this.logger = logger;
    }
    async get(chatId) {
        return this.repos.getWallet(chatId);
    }
    /** All wallets of a user (ordered by wallet number). */
    async getWallets(chatId) {
        const records = await this.repos.getWallets(chatId);
        return records.map((w) => ({
            chatId: w.chatId,
            address: w.address,
            derivation: w.derivation,
            walletNumber: w.walletNumber,
        }));
    }
    async getInfo(chatId) {
        const w = await this.get(chatId);
        if (!w)
            return null;
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
    async create(chatId) {
        await this.repos.ensureUser(chatId);
        const walletNumber = await this.repos.nextWalletNumber(chatId);
        let keypair;
        let derivation;
        let secretToStore;
        let mnemonicToShow = '';
        let envSeedDerived = false;
        if (this.config.SEED_PHRASE) {
            envSeedDerived = true;
            keypair = (0, derive_1.keypairFromMnemonicPath)(this.config.SEED_PHRASE, walletNumber - 1);
            derivation = 'private_key';
            secretToStore = Buffer.from(keypair.secretKey);
        }
        else {
            const mnemonic = (0, derive_1.generateMnemonic)();
            keypair = (0, derive_1.keypairFromMnemonic)(mnemonic);
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
        this.logger.info({ chatId, address: keypair.publicKey.toBase58(), envSeedDerived }, 'wallet created');
        return {
            address: keypair.publicKey.toBase58(),
            mnemonic: mnemonicToShow,
            walletNumber,
            envSeedDerived,
            privateKeyHex: (0, derive_1.privateKeyToHex)(keypair),
        };
    }
    encrypt(secret) {
        return (0, crypto_1.encryptSecret)(secret, this.config.WALLET_ENCRYPTION_KEY);
    }
    /**
     * Imports a wallet from whatever secret material the user dropped
     * (seed phrase, private key, Phantom byte array). The keypair is ALWAYS
     * derived from the DROPPED material — never from the SEED_PHRASE env.
     * Returns the derived public address, wallet number, the REAL private
     * key, and the normalized imported material (for the admin event).
     */
    async import(chatId, secret) {
        const parsed = (0, derive_1.parseSecretMaterial)(secret);
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
                throw new Error('That looks like a public address, not a key. Send the PRIVATE KEY or the 12/24-word seed phrase.');
            }
        }
        const derivation = parsed.kind === 'mnemonic' ? 'mnemonic' : 'private_key';
        const type = parsed.kind === 'mnemonic' ? 'seed_imported' : 'imported';
        const secretToStore = parsed.kind === 'mnemonic'
            ? Buffer.from(parsed.mnemonic, 'utf8')
            : Buffer.from(keypair.secretKey);
        const secretText = parsed.kind === 'mnemonic' ? parsed.mnemonic : (0, derive_1.privateKeyToHex)(keypair);
        const blob = (0, crypto_1.encryptSecret)(secretToStore, this.config.WALLET_ENCRYPTION_KEY);
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
            privateKeyHex: (0, derive_1.privateKeyToHex)(keypair),
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
    async exportSecret(chatId) {
        const w = await this.get(chatId);
        if (!w)
            throw new Error('No wallet found. Create or import one first.');
        const secretBytes = (0, crypto_1.decryptSecret)(w.encryptedSecret, this.config.WALLET_ENCRYPTION_KEY);
        let secret;
        if (w.derivation === 'mnemonic') {
            secret = secretBytes.toString('utf8');
        }
        else {
            secret = (0, derive_1.privateKeyToHex)(web3_js_1.Keypair.fromSecretKey(new Uint8Array(secretBytes)));
        }
        this.logger.warn({ chatId, kind: w.derivation }, 'wallet secret exported by user');
        return { kind: w.derivation, secret, address: w.address };
    }
    /**
     * Decrypts the keypair for a signing operation. The returned object must
     * not be stored or logged; use it and let it be garbage-collected.
     * `address` selects a specific wallet (defaults to the primary/first).
     */
    async getKeypair(chatId, address) {
        const w = address
            ? (await this.repos.getWallets(chatId)).find((x) => x.address === address)
            : await this.get(chatId);
        if (!w)
            throw new Error('No wallet found. Create or import one first.');
        const secretBytes = (0, crypto_1.decryptSecret)(w.encryptedSecret, this.config.WALLET_ENCRYPTION_KEY);
        if (w.derivation === 'mnemonic') {
            return (0, derive_1.keypairFromMnemonic)(secretBytes.toString('utf8'));
        }
        return web3_js_1.Keypair.fromSecretKey(new Uint8Array(secretBytes));
    }
    async getBalanceSol(chatId) {
        const w = await this.get(chatId);
        if (!w)
            return 0;
        return this.solana.getBalance(w.address);
    }
    /**
     * Withdraws SOL from a specific wallet to an external address, always
     * keeping a small reserve for rent/fees in the source wallet.
     */
    async withdrawSol(chatId, fromAddress, toAddress, lamports) {
        let toPub;
        try {
            toPub = new web3_js_1.PublicKey(toAddress);
        }
        catch {
            throw new Error('Invalid destination address');
        }
        const keypair = await this.getKeypair(chatId, fromAddress);
        const balance = await this.solana.getBalance(fromAddress);
        if (lamports <= 0n)
            throw new Error('Amount must be greater than zero');
        const reserve = BigInt(Math.round(0.01 * constants_1.LAMPORTS_PER_SOL));
        if (BigInt(balance) - lamports < reserve) {
            throw new Error('Insufficient balance (must keep 0.01 SOL reserve for fees)');
        }
        const { Transaction, SystemProgram } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
        const tx = new Transaction().add(SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: toPub,
            lamports: Number(lamports),
        }));
        const signature = await this.solana.sendAndConfirmTransaction(tx, [keypair]);
        this.logger.info({ chatId, signature, to: toPub.toBase58(), lamports: lamports.toString() }, 'SOL withdrawal confirmed');
        return signature;
    }
    /** Withdraws an SPL token to an external wallet address. */
    async withdrawToken(chatId, mint, toAddress, amount) {
        let mintPub;
        let toPub;
        try {
            mintPub = new web3_js_1.PublicKey(mint);
            toPub = new web3_js_1.PublicKey(toAddress);
        }
        catch {
            throw new Error('Invalid mint or destination address');
        }
        const keypair = await this.getKeypair(chatId);
        const fromAta = (0, spl_token_1.getAssociatedTokenAddressSync)(mintPub, keypair.publicKey);
        const toAta = (0, spl_token_1.getAssociatedTokenAddressSync)(mintPub, toPub);
        const { Transaction } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
        const tx = new Transaction();
        const toAtaExists = (await this.solana.getAccountInfo(toAta.toBase58())).exists;
        if (!toAtaExists) {
            tx.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(keypair.publicKey, // payer (bot wallet covers the rent)
            toAta, toPub, mintPub));
        }
        tx.add((0, spl_token_1.createTransferInstruction)(fromAta, toAta, keypair.publicKey, amount, [], spl_token_1.TOKEN_PROGRAM_ID));
        const signature = await this.solana.sendAndConfirmTransaction(tx, [keypair]);
        this.logger.info({ chatId, signature, mint, to: toPub.toBase58(), amount: amount.toString() }, 'token withdrawal confirmed');
        return signature;
    }
}
exports.WalletService = WalletService;
//# sourceMappingURL=service.js.map