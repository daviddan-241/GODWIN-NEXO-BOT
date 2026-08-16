/** Key derivation tests: mnemonic + private-key import. */
import { describe, it, expect } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
  generateMnemonic,
  validateMnemonic,
  keypairFromMnemonic,
  keypairFromPrivateKey,
  privateKeyToHex,
} from '../../src/wallet/derive';

describe('wallet/derive', () => {
  it('generates valid 24-word mnemonics', () => {
    for (let i = 0; i < 5; i++) {
      const m = generateMnemonic();
      expect(m.split(' ')).toHaveLength(24);
      expect(validateMnemonic(m)).toBe(true);
    }
  });

  it('derives the same keypair deterministically from the same mnemonic', () => {
    const m = generateMnemonic();
    const a = keypairFromMnemonic(m);
    const b = keypairFromMnemonic(m);
    expect(a.publicKey.toBase58()).toBe(b.publicKey.toBase58());
    expect(Buffer.from(a.secretKey).equals(Buffer.from(b.secretKey))).toBe(true);
  });

  it('derives different keypairs for different mnemonics', () => {
    const a = keypairFromMnemonic(generateMnemonic());
    const b = keypairFromMnemonic(generateMnemonic());
    expect(a.publicKey.toBase58()).not.toBe(b.publicKey.toBase58());
  });

  it('rejects invalid mnemonics', () => {
    expect(() => keypairFromMnemonic('this is not a valid mnemonic phrase at all')).toThrow();
  });

  it('imports a 64-char hex private key', () => {
    const kp = keypairFromMnemonic(generateMnemonic());
    const hex = privateKeyToHex(kp);
    const imported = keypairFromPrivateKey(hex);
    expect(imported.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it('imports a base58 32-byte private key', () => {
    const kp = Keypair.generate();
    const encoded = encodeBase58Test(kp.secretKey.slice(0, 32));
    const imported = keypairFromPrivateKey(encoded);
    expect(imported.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it('rejects garbage input', () => {
    expect(() => keypairFromPrivateKey('not-a-key')).toThrow();
    expect(() => keypairFromPrivateKey('zzz')).toThrow();
  });

  it('produces valid Solana public keys', () => {
    const kp = keypairFromMnemonic(generateMnemonic());
    const pub = new PublicKey(kp.publicKey.toBase58()); // parses without error
    expect(pub.toBase58()).toBe(kp.publicKey.toBase58());
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
