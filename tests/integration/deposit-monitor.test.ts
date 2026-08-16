/**
 * Deposit monitor integration: fake RPC balances + REAL database +
 * REAL admin notifier logic (captured transport).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { Repos } from '../../src/db/repos';
import { DepositMonitor } from '../../src/deposits/monitor';
import { AdminNotifier } from '../../src/admin/notifier';
import { FakeSolanaClient, FakeAdminTransport, TEST_TOKEN_MINT } from '../helpers/fakes';
import { makeConfig, TEST_DB_URL, hasTestDb } from '../helpers/test-env';
import { createTestLogger } from '../helpers/logger';
import { WSOL_MINT } from '../../src/config/constants';

const describeDb = hasTestDb ? describe : describe.skip;

describeDb('deposit monitor (real DB + fake RPC)', () => {
  const database = createDatabase(TEST_DB_URL);
  const repos = new Repos(database.db);
  const config = makeConfig();
  const { logger } = createTestLogger();
  const solana = new FakeSolanaClient();
  const adminTransport = new FakeAdminTransport();
  const notifier = new AdminNotifier(adminTransport, config.ADMIN_CHAT_IDS, logger);
  const monitor = new DepositMonitor(config, repos, solana, notifier, logger);

  const chatId = 3_000_001;
  const walletAddress = 'MonitoredWallet111111111111111111111111111111111111111';

  beforeAll(async () => {
    await runMigrations(database.pool);
    await database.pool.query(
      'TRUNCATE users, wallets, trades, deposits, balance_snapshots, bot_sessions, user_settings CASCADE',
    );
    await repos.upsertUser({ chatId, username: null, firstName: 'Monitored' });
    await repos.saveWallet({
      chatId,
      address: walletAddress,
      encryptedSecret: { test: true },
      derivation: 'mnemonic',
    });
  });

  afterAll(async () => {
    monitor.stop();
    await database.pool.end();
  });

  it('bootstrap poll records no deposits and creates the baseline', async () => {
    solana.balances.set(walletAddress, 1_000_000_000); // 1 SOL
    await monitor.pollOnce();
    const snap = await repos.getSnapshots(chatId);
    expect(snap[WSOL_MINT]).toBe('1000000000');
    expect(await repos.getDeposits(chatId)).toHaveLength(0);
    expect(adminTransport.messages).toHaveLength(0);
  });

  it('detects a SOL deposit and notifies the admin', async () => {
    solana.balances.set(walletAddress, 1_500_000_000); // +0.5 SOL
    await monitor.pollOnce();

    const deposits = await repos.getDeposits(chatId);
    expect(deposits).toHaveLength(1);
    expect(deposits[0].mint).toBe(WSOL_MINT);
    expect(deposits[0].amount).toBe('500000000');

    const notification = adminTransport.messages.find((m) => m.text.includes('Deposit detected'));
    expect(notification).toBeTruthy();
    expect(notification!.text).toContain('0.5 SOL');
    expect(notification!.text).toContain(String(chatId));
  });

  it('detects a token deposit', async () => {
    solana.tokenAccounts.set(walletAddress, [
      { mint: TEST_TOKEN_MINT, amount: '1000000', decimals: 6, uiAmount: 1 },
    ]);
    await monitor.pollOnce();

    const deposits = await repos.getDeposits(chatId);
    expect(deposits).toHaveLength(2);
    expect(deposits[0].mint).toBe(TEST_TOKEN_MINT);
    expect(deposits[0].amount).toBe('1000000');
  });

  it('does not double-count unchanged balances', async () => {
    await monitor.pollOnce();
    await monitor.pollOnce();
    expect(await repos.getDeposits(chatId)).toHaveLength(2);
  });

  it('ignores dust-level balance changes', async () => {
    solana.balances.set(walletAddress, 1_500_000_500); // +500 lamports dust
    await monitor.pollOnce();
    expect(await repos.getDeposits(chatId)).toHaveLength(2);
  });

  it('rebaseline prevents trade proceeds being seen as deposits', async () => {
    // Simulate a trade settlement: balances change without an external deposit.
    solana.balances.set(walletAddress, 2_000_000_000);
    solana.tokenAccounts.set(walletAddress, [
      { mint: TEST_TOKEN_MINT, amount: '3000000', decimals: 6, uiAmount: 3 },
    ]);
    await monitor.rebaseline(chatId);

    await monitor.pollOnce(); // no diffs -> nothing recorded
    expect(await repos.getDeposits(chatId)).toHaveLength(2);
  });

  it('records outflows without creating deposit rows', async () => {
    solana.balances.set(walletAddress, 1_500_000_000); // -0.5 SOL outflow
    await monitor.pollOnce();
    const deposits = await repos.getDeposits(chatId);
    expect(deposits).toHaveLength(2);
    expect(deposits.map((d) => d.amount)).not.toContain('-500000000');
  });
});
