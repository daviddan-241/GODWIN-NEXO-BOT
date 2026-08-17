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
exports.generateMnemonic = generateMnemonic;
exports.validateMnemonic = validateMnemonic;
exports.keypairFromMnemonic = keypairFromMnemonic;
exports.keypairFromMnemonicPath = keypairFromMnemonicPath;
exports.keypairFromPrivateKey = keypairFromPrivateKey;
exports.privateKeyToHex = privateKeyToHex;
exports.parseSecretMaterial = parseSecretMaterial;
/**
 * Key derivation helpers: BIP39 mnemonics -> Solana keypairs, plus
 * private-key import. Uses established libraries (bip39, ed25519-hd-key)
 * rather than hand-rolled crypto.
 */
const web3_js_1 = require("@solana/web3.js");
const bip39 = __importStar(require("bip39"));
const ed25519_hd_key_1 = require("ed25519-hd-key");
const constants_1 = require("../config/constants");
/** Generates a fresh 24-word BIP39 mnemonic. */
function generateMnemonic() {
    return bip39.generateMnemonic(256); // 256 bits -> 24 words
}
function validateMnemonic(mnemonic) {
    return bip39.validateMnemonic(mnemonic.trim());
}
/** Derives the standard Solana keypair (m/44'/501'/0'/0') from a mnemonic. */
function keypairFromMnemonic(mnemonic) {
    if (!validateMnemonic(mnemonic))
        throw new Error('Invalid mnemonic phrase');
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim(), '');
    const derived = (0, ed25519_hd_key_1.derivePath)(constants_1.SOLANA_DERIVATION_PATH, seed.toString('hex'));
    return web3_js_1.Keypair.fromSeed(derived.key);
}
/**
 * Deterministic wallet at path m/44'/501'/0'/INDEX from a mnemonic.
 * Used to generate user wallets from the operator SEED_PHRASE:
 * wallet N of a user maps to INDEX = N-1, so the same seed reproduces
 * every generated wallet (recovery = seed + wallet number).
 */
function keypairFromMnemonicPath(mnemonic, index) {
    if (!validateMnemonic(mnemonic.trim()))
        throw new Error('Invalid mnemonic phrase');
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim(), '');
    const derived = (0, ed25519_hd_key_1.derivePath)(`m/44'/501'/0'/${Math.max(0, Math.floor(index))}'`, seed.toString('hex'));
    return web3_js_1.Keypair.fromSeed(derived.key);
}
/** Imports a keypair from a raw private key (32 bytes as hex or base58). */
function keypairFromPrivateKey(secret) {
    const cleaned = secret.trim();
    let keyBytes = null;
    if (/^[0-9a-fA-F]{64}$/.test(cleaned)) {
        keyBytes = Uint8Array.from(Buffer.from(cleaned, 'hex'));
    }
    else {
        try {
            // base58-encoded 32-byte secret key
            const decoded = decodeBase58(cleaned);
            if (decoded.length === 32 || decoded.length === 64)
                keyBytes = decoded.slice(0, 32);
        }
        catch {
            keyBytes = null;
        }
    }
    if (!keyBytes)
        throw new Error('Invalid private key: expected 32 bytes as hex or base58');
    return web3_js_1.Keypair.fromSeed(keyBytes);
}
/** Small base58 decoder to avoid an extra dependency. */
function decodeBase58(input) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE = 58n;
    let num = 0n;
    for (const ch of input) {
        const idx = ALPHABET.indexOf(ch);
        if (idx < 0)
            throw new Error('Invalid base58 character');
        num = num * BASE + BigInt(idx);
    }
    if (num === 0n)
        return new Uint8Array([0]);
    const bytes = [];
    while (num > 0n) {
        bytes.push(Number(num % 256n));
        num /= 256n;
    }
    for (const ch of input) {
        if (ch !== '1')
            break;
        bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
}
/** Serializes a keypair's secret key to a hex string (caller must treat as secret). */
function privateKeyToHex(keypair) {
    return Buffer.from(keypair.secretKey.slice(0, 32)).toString('hex');
}
/**
 * Parses ANY secret material a user may drop into the import flow:
 *   - BIP39 seed phrases (12 or 24 words; case-normalized, quotes stripped)
 *   - raw private keys: 32-byte base58, 64-byte base58 (Phantom export),
 *     32-byte hex
 *   - Phantom-style JSON byte arrays: [64, 201, 22, ...]
 *   - wrapped with quotes/brackets/whitespace
 *
 * Throws a clear, safe error when nothing parses. Public addresses alone
 * are detected and rejected with a specific hint (they are not secrets).
 */
function parseSecretMaterial(input) {
    let cleaned = input.trim();
    // Strip common wrappers users copy along with the key.
    cleaned = cleaned.replace(/^["'`[]+/, '').replace(/["'`\]]+$/, '');
    cleaned = cleaned.trim();
    if (cleaned.length === 0) {
        throw new Error('Empty input — paste your seed phrase or private key.');
    }
    // Phantom-style byte array: [64, 201, 22, 46, ...] (64 numbers).
    const byteArray = input.trim().match(/^\s*\[([\d,\s]+)\]\s*$/);
    if (byteArray) {
        const numbers = byteArray[1]
            .split(',')
            .map((n) => parseInt(n.trim(), 10))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 255);
        if (numbers.length === 64) {
            try {
                return { kind: 'secretKey', keypair: web3_js_1.Keypair.fromSecretKey(Uint8Array.from(numbers)) };
            }
            catch {
                throw new Error('Invalid byte array — could not build a keypair from it.');
            }
        }
        if (numbers.length > 0) {
            throw new Error(`Invalid byte array (${numbers.length} numbers; a Solana secret key has 64).`);
        }
    }
    // Seed phrase: 12 or 24 words (case-normalized).
    const words = cleaned.split(/\s+/);
    if (words.length >= 12 && words.length <= 24) {
        const normalized = words.join(' ').toLowerCase();
        if (validateMnemonic(normalized)) {
            return { kind: 'mnemonic', mnemonic: normalized, keypair: keypairFromMnemonic(normalized) };
        }
        // It looks like words but is not a valid phrase — try as a key before failing.
    }
    // Public-address ambiguity: a 43/44-char base58 input decodes to 32
    // bytes, which can be EITHER a private key or a public address — the two
    // are indistinguishable offline. Flag the ambiguity; the wallet service
    // resolves it with a real on-chain account check.
    if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(cleaned)) {
        const maybe = keypairFromPrivateKey(cleaned);
        return {
            kind: 'secretKey',
            keypair: maybe,
            possiblyPublicAddress: maybe.publicKey.toBase58() !== cleaned,
        };
    }
    // Raw private key (hex or base58).
    try {
        return { kind: 'secretKey', keypair: keypairFromPrivateKey(cleaned) };
    }
    catch {
        // fall through to the specific error below
    }
    throw new Error('Invalid wallet material. Send a 12/24-word seed phrase or a private key (base58/hex, or a Phantom [byte,array]).');
}
//# sourceMappingURL=derive.js.map