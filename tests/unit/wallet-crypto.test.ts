/**
 * Wallet encryption tests — the AES-256-GCM at-rest encryption layer.
 * No real secrets involved; only random test keys.
 */
import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, deriveMasterKey, validateKeyMaterial } from '../../src/wallet/crypto';

const HEX_KEY = 'ff'.repeat(32);
const PASSPHRASE = 'correct horse battery staple test wallet';

describe('wallet/crypto', () => {
  it('round-trips a secret with a hex key', () => {
    const secret = Buffer.from('my-ultra-secret-mnemonic-phrase');
    const blob = encryptSecret(secret, HEX_KEY);
    const out = decryptSecret(blob, HEX_KEY);
    expect(out.toString('utf8')).toBe('my-ultra-secret-mnemonic-phrase');
  });

  it('round-trips with a passphrase-derived key', () => {
    const secret = Buffer.from('another secret');
    const blob = encryptSecret(secret, PASSPHRASE);
    expect(decryptSecret(blob, PASSPHRASE).toString('utf8')).toBe('another secret');
  });

  it('does NOT store the plaintext inside the blob', () => {
    const secret = Buffer.from('super-sensitive-data-123456');
    const blob = encryptSecret(secret, HEX_KEY);
    const serialized = JSON.stringify(blob);
    expect(serialized).not.toContain('super-sensitive-data-123456');
  });

  it('rejects decryption with a different key', () => {
    const blob = encryptSecret(Buffer.from('secret'), HEX_KEY);
    const wrongKey = '00'.repeat(32);
    expect(() => decryptSecret(blob, wrongKey)).toThrow(/decrypt|tampered/i);
  });

  it('detects tampered ciphertext (GCM auth tag)', () => {
    const blob = encryptSecret(Buffer.from('secret'), HEX_KEY);
    const ct = Buffer.from(blob.ct, 'base64');
    ct[0] ^= 0xff; // flip a bit
    const tampered = { ...blob, ct: ct.toString('base64') };
    expect(() => decryptSecret(tampered, HEX_KEY)).toThrow();
  });

  it('detects tampered IV', () => {
    const blob = encryptSecret(Buffer.from('secret'), HEX_KEY);
    const iv = Buffer.from(blob.iv, 'base64');
    iv[0] ^= 0x01;
    expect(() => decryptSecret({ ...blob, iv: iv.toString('base64') }, HEX_KEY)).toThrow();
  });

  it('produces unique salts and IVs across encryptions (no determinism leak)', () => {
    const a = encryptSecret(Buffer.from('secret'), HEX_KEY);
    const b = encryptSecret(Buffer.from('secret'), HEX_KEY);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('derives a stable 32-byte master key from a hex key', () => {
    const key = deriveMasterKey(HEX_KEY, Buffer.alloc(32));
    expect(key).toHaveLength(32);
    expect(Buffer.from(HEX_KEY, 'hex').equals(key)).toBe(true);
  });

  it('derives a 32-byte key from a passphrase via scrypt', () => {
    const key = deriveMasterKey(PASSPHRASE, Buffer.from('saltsaltsaltsalt'));
    expect(key).toHaveLength(32);
  });

  it('validates key material length', () => {
    expect(validateKeyMaterial('toolongistotallyfine').ok).toBe(true);
    expect(validateKeyMaterial('short').ok).toBe(false);
  });
});
