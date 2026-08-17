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
exports.keypairFromPrivateKey = keypairFromPrivateKey;
exports.privateKeyToHex = privateKeyToHex;
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
//# sourceMappingURL=derive.js.map