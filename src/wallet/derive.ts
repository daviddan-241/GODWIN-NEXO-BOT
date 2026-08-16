/**
 * Key derivation helpers: BIP39 mnemonics -> Solana keypairs, plus
 * private-key import. Uses established libraries (bip39, ed25519-hd-key)
 * rather than hand-rolled crypto.
 */
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { SOLANA_DERIVATION_PATH } from '../config/constants';

/** Generates a fresh 24-word BIP39 mnemonic. */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(256); // 256 bits -> 24 words
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim());
}

/** Derives the standard Solana keypair (m/44'/501'/0'/0') from a mnemonic. */
export function keypairFromMnemonic(mnemonic: string): Keypair {
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid mnemonic phrase');
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim(), '');
  const derived = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex'));
  return Keypair.fromSeed(derived.key);
}

/** Imports a keypair from a raw private key (32 bytes as hex or base58). */
export function keypairFromPrivateKey(secret: string): Keypair {
  const cleaned = secret.trim();
  let keyBytes: Uint8Array | null = null;

  if (/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    keyBytes = Uint8Array.from(Buffer.from(cleaned, 'hex'));
  } else {
    try {
      // base58-encoded 32-byte secret key
      const decoded = decodeBase58(cleaned);
      if (decoded.length === 32 || decoded.length === 64) keyBytes = decoded.slice(0, 32);
    } catch {
      keyBytes = null;
    }
  }

  if (!keyBytes) throw new Error('Invalid private key: expected 32 bytes as hex or base58');
  return Keypair.fromSeed(keyBytes);
}

/** Small base58 decoder to avoid an extra dependency. */
function decodeBase58(input: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const BASE = 58n;
  let num = 0n;
  for (const ch of input) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base58 character');
    num = num * BASE + BigInt(idx);
  }
  if (num === 0n) return new Uint8Array([0]);
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.push(Number(num % 256n));
    num /= 256n;
  }
  for (const ch of input) {
    if (ch !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/** Serializes a keypair's secret key to a hex string (caller must treat as secret). */
export function privateKeyToHex(keypair: Keypair): string {
  return Buffer.from(keypair.secretKey.slice(0, 32)).toString('hex');
}
