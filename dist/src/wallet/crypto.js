"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveMasterKey = deriveMasterKey;
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
exports.safeEqual = safeEqual;
exports.validateKeyMaterial = validateKeyMaterial;
/**
 * Wallet encryption layer.
 *
 * SECURITY MODEL
 * --------------
 * Private keys are stored in PostgreSQL encrypted with AES-256-GCM.
 * The 32-byte encryption key is derived from WALLET_ENCRYPTION_KEY via
 * scrypt (random per-record salt, N=2^15). The database only ever sees
 * ciphertext + salt + IV + GCM auth tag; the key exists only in process
 * memory and in the environment of the host running the bot.
 *
 * AES-256-GCM is authenticated encryption: any tampering with the stored
 * blob (or the wrong key) fails decryption loudly instead of yielding a
 * corrupted key. Secrets are NEVER logged — callers are responsible for
 * never passing decrypted material to the logger (see wallet/service.ts).
 *
 * See SECURITY.md for the full threat model.
 */
const node_crypto_1 = require("node:crypto");
const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const BLOB_VERSION = 1;
/**
 * Derives a 32-byte AES key from WALLET_ENCRYPTION_KEY.
 * Accepts either a 64-char hex string (used verbatim) or any passphrase
 * (scrypt-derived).
 */
function deriveMasterKey(material, salt) {
    if (/^[0-9a-fA-F]{64}$/.test(material.trim())) {
        return Buffer.from(material.trim(), 'hex');
    }
    return (0, node_crypto_1.scryptSync)(material, salt, KEY_LENGTH, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: 128 * 1024 * 1024, // N=2^15 requires ~32MB; allow headroom
    });
}
function encryptSecret(plaintext, masterKeyMaterial) {
    const salt = (0, node_crypto_1.randomBytes)(32);
    const key = deriveMasterKey(masterKeyMaterial, salt);
    const iv = (0, node_crypto_1.randomBytes)(IV_LENGTH);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        v: BLOB_VERSION,
        kdf: 'scrypt',
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        ct: ct.toString('base64'),
    };
}
function decryptSecret(blob, masterKeyMaterial) {
    if (!blob || blob.v !== BLOB_VERSION || blob.kdf !== 'scrypt') {
        throw new Error('Unsupported encrypted wallet format');
    }
    const salt = Buffer.from(blob.salt, 'base64');
    const key = deriveMasterKey(masterKeyMaterial, blob.salt ? salt : (0, node_crypto_1.randomBytes)(32));
    const iv = Buffer.from(blob.iv, 'base64');
    const tag = Buffer.from(blob.tag, 'base64');
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    try {
        return Buffer.concat([decipher.update(Buffer.from(blob.ct, 'base64')), decipher.final()]);
    }
    catch {
        // GCM authentication failure: wrong key or tampered ciphertext.
        throw new Error('Failed to decrypt wallet secret (wrong key or tampered data)');
    }
}
/** Constant-time comparison for key material (used only in tests/verification). */
function safeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(a, b);
}
/**
 * Validates a WALLET_ENCRYPTION_KEY format early, before any wallet is
 * created, so misconfiguration fails at startup rather than at first trade.
 */
function validateKeyMaterial(material) {
    if (material.length < 12)
        return { ok: false, reason: 'too short (min 12 chars)' };
    return { ok: true };
}
//# sourceMappingURL=crypto.js.map