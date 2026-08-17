/** Robust secret-material parsing (import flow) tests. */
import { describe, it, expect } from 'vitest';
import { Keypair } from '@solana/web3.js';
import { generateMnemonic, parseSecretMaterial, privateKeyToHex } from '../../src/wallet/derive';

describe('wallet/parseSecretMaterial', () => {
  it('parses a 12/24-word seed phrase (case-normalized)', () => {
    const mnemonic = generateMnemonic();
    const parsed = parseSecretMaterial(mnemonic.toUpperCase());
    expect(parsed.kind).toBe('mnemonic');
    if (parsed.kind === 'mnemonic') {
      expect(parsed.mnemonic).toBe(mnemonic.toLowerCase());
      expect(parsed.keypair.publicKey.toBase58()).toBeTruthy();
    }
  });

  it('parses a seed phrase wrapped in quotes/whitespace', () => {
    const mnemonic = generateMnemonic();
    const parsed = parseSecretMaterial(`  "${mnemonic}"  `);
    expect(parsed.kind).toBe('mnemonic');
  });

  it('parses a 32-byte hex private key', () => {
    const kp = Keypair.generate();
    const hex = privateKeyToHex(kp);
    const parsed = parseSecretMaterial(hex);
    expect(parsed.kind).toBe('secretKey');
    if (parsed.kind === 'secretKey') {
      expect(parsed.keypair.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    }
  });

  it('parses a 64-byte base58 Phantom-style secret key', () => {
    const kp = Keypair.generate();
    const b58 = encodeBase58Test(kp.secretKey); // 64 bytes
    const parsed = parseSecretMaterial(b58);
    expect(parsed.kind).toBe('secretKey');
    if (parsed.kind === 'secretKey') {
      expect(parsed.keypair.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    }
  });

  it('parses a Phantom-style JSON byte array', () => {
    const kp = Keypair.generate();
    const arr = `[${Array.from(kp.secretKey).join(', ')}]`;
    const parsed = parseSecretMaterial(arr);
    expect(parsed.kind).toBe('secretKey');
    if (parsed.kind === 'secretKey') {
      expect(parsed.keypair.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
    }
  });

  it('flags ambiguous 32-byte base58 inputs as possibly a public address', () => {
    const kp = Keypair.generate();
    const parsed = parseSecretMaterial(kp.publicKey.toBase58());
    expect(parsed.kind).toBe('secretKey');
    if (parsed.kind === 'secretKey') {
      expect(parsed.possiblyPublicAddress).toBe(true);
    }
    // A real 32-byte private key (hex) is never flagged.
    const parsedKey = parseSecretMaterial(privateKeyToHex(kp));
    expect(parsedKey.kind).toBe('secretKey');
    if (parsedKey.kind === 'secretKey') {
      expect(parsedKey.possiblyPublicAddress).toBeUndefined();
    }
  });

  it('rejects garbage with a helpful error', () => {
    expect(() => parseSecretMaterial('not a key at all 123')).toThrow(/seed phrase or a private key/);
    expect(() => parseSecretMaterial('')).toThrow(/Empty input/);
  });
});

function encodeBase58Test(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  if (num === 0n) return '1'.repeat(bytes.length || 1);
  let out = '';
  while (num > 0n) {
    out = ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  let leading = '';
  for (const b of bytes) {
    if (b !== 0) break;
    leading += '1';
  }
  return leading + out;
}
