/**
 * Wallet verification tool — checks generation/import/export against the
 * REAL database and crypto stack, printing ONLY public information.
 * Never prints mnemonics or private keys.
 *
 * Usage:
 *   DATABASE_URL=... WALLET_ENCRYPTION_KEY=... npx tsx scripts/verify-wallet.ts
 */
import 'dotenv/config';
import { loadConfig } from '../src/config/env';
import { createDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { Repos } from '../src/db/repos';
import { WalletService } from '../src/wallet/service';
import { createLogger } from '../src/logging/logger';
import { FakeSolanaClient } from '../tests/helpers/fakes';

const VERIFY_CHAT_ID = 90_000_001; // dedicated, never a real user

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger('silent');
  const database = createDatabase(config.DATABASE_URL);
  await runMigrations(database.pool);
  const repos = new Repos(database.db);
  const wallets = new WalletService(repos, new FakeSolanaClient(), config, logger);

  try {
    // Register a dedicated verification user (FK-required, never a real chat).
    await repos.upsertUser({ chatId: VERIFY_CHAT_ID, username: 'verify-wallet', firstName: 'Verify' });

    // 1. Generation
    const { address, mnemonic } = await wallets.create(VERIFY_CHAT_ID);
    const stored = await repos.getWallet(VERIFY_CHAT_ID);
    if (!stored) throw new Error('wallet was not persisted');
    const serialized = JSON.stringify(stored.encryptedSecret);

    const plaintextLeak =
      serialized.includes(mnemonic) || serialized.includes(mnemonic.split(' ')[0]);
    if (plaintextLeak) {
      throw new Error('FATAL: plaintext secret found in the database record');
    }

    const derived = await wallets.getKeypair(VERIFY_CHAT_ID);
    if (derived.publicKey.toBase58() !== address) {
      throw new Error('FATAL: decrypted key does not match the stored address');
    }

    console.log('PASS  wallet generated and persisted (ciphertext only)');
    console.log(`      public address: ${address}`);

    // 2. Export round-trip (value checked, never printed)
    const exported = await wallets.exportSecret(VERIFY_CHAT_ID);
    if (exported.secret !== mnemonic || exported.kind !== 'mnemonic') {
      throw new Error('FATAL: export did not round-trip the original secret');
    }
    console.log('PASS  secret export round-trips the original mnemonic (not printed)');

    // 3. Private-key import path
    const keypair = await wallets.getKeypair(VERIFY_CHAT_ID);
    const hex = Buffer.from(keypair.secretKey.slice(0, 32)).toString('hex');
    await repos.deleteAllWallets(VERIFY_CHAT_ID);
    const imported = await wallets.import(VERIFY_CHAT_ID, hex);
    if (imported.address !== address) {
      throw new Error('FATAL: private-key import produced a different address');
    }
    console.log('PASS  private-key import reproduces the same address');
    console.log(`      public address: ${imported.address}`);

    // 4. Wrong key must fail loudly
    const wrongKeyConfig = { ...config, WALLET_ENCRYPTION_KEY: '00'.repeat(32) };
    const wrongKeyWallets = new WalletService(repos, new FakeSolanaClient(), wrongKeyConfig, logger);
    let rejected = false;
    try {
      await wrongKeyWallets.getKeypair(VERIFY_CHAT_ID);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('FATAL: a wrong encryption key decrypted the wallet');
    console.log('PASS  wrong WALLET_ENCRYPTION_KEY is rejected (GCM authentication)');

    console.log('\nWallet verification: ALL CHECKS PASSED (no secrets printed).');
  } finally {
    await repos.deleteAllWallets(VERIFY_CHAT_ID).catch(() => undefined);
    await database.pool.end();
  }
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
