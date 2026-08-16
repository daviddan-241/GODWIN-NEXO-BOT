/**
 * Repository/database tests against a REAL PostgreSQL instance.
 * Skipped when TEST_DATABASE_URL is not set (unit tests stay DB-free).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, pingDatabase } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { Repos } from '../../src/db/repos';
import { TEST_DB_URL, hasTestDb } from '../helpers/test-env';

const describeDb = hasTestDb ? describe : describe.skip;

describeDb('database layer (real PostgreSQL)', () => {
  const database = createDatabase(TEST_DB_URL);
  const repos = new Repos(database.db);

  beforeAll(async () => {
    await runMigrations(database.pool);
    await database.pool.query('TRUNCATE users, wallets, trades, deposits, balance_snapshots, bot_sessions, user_settings CASCADE');
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it('pings successfully', async () => {
    await expect(pingDatabase(database)).resolves.toBeUndefined();
  });

  it('migrations are idempotent', async () => {
    await expect(runMigrations(database.pool)).resolves.toEqual([]);
  });

  it('upserts users and enforces uniqueness on chat_id', async () => {
    await repos.upsertUser({ chatId: 900001, username: 'alice', firstName: 'Alice' });
    await repos.upsertUser({ chatId: 900001, username: 'alice2', firstName: 'Alice' });
    expect(await repos.countUsers()).toBe(1);
    const settings = await repos.getSettings(900001);
    expect(settings.slippageBps).toBe(100); // defaults
  });

  it('persists and updates settings', async () => {
    await repos.updateSettings(900001, { slippageBps: 250, buyAmountSol: '0.5' });
    const s = await repos.getSettings(900001);
    expect(s.slippageBps).toBe(250);
    expect(s.buyAmountSol).toBe('0.5');
  });

  it('stores an encrypted wallet record and never sees plaintext', async () => {
    await repos.saveWallet({
      chatId: 900001,
      address: 'WalletAddress111111111111111111111111111111111',
      encryptedSecret: { v: 1, kdf: 'scrypt', salt: 'x', iv: 'y', tag: 'z', ct: 'ciphertext' },
      derivation: 'mnemonic',
      walletNumber: 1,
      type: 'generated',
    });
    const w = await repos.getWallet(900001);
    expect(w?.address).toBe('WalletAddress111111111111111111111111111111111');
    expect(w?.walletNumber).toBe(1);
    expect(JSON.stringify(w?.encryptedSecret)).not.toContain('phrase');
  });

  it('sessions round-trip with payload', async () => {
    await repos.saveSession({ chatId: 900001, state: 'awaiting_buy_token', payload: { tokenMint: 'mint' } });
    const s = await repos.getSession(900001);
    expect(s.state).toBe('awaiting_buy_token');
    expect(s.payload.tokenMint).toBe('mint');
    await repos.resetSession(900001);
    expect((await repos.getSession(900001)).state).toBe('idle');
  });

  it('trades: insert -> confirm -> query', async () => {
    const t = await repos.insertTrade({
      chatId: 900001,
      side: 'buy',
      inputMint: 'in',
      outputMint: 'out',
      inputAmount: '100',
      outputAmount: '50',
      priceUsd: '1.5',
      slippageBps: 100,
      txSignature: null,
      status: 'pending',
      error: null,
    });
    expect(t.id).toBeGreaterThan(0);
    await repos.updateTradeStatus(t.id, 'confirmed', { txSignature: 'sig123' });
    const trades = await repos.getTrades(900001);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe('confirmed');
    expect(trades[0].txSignature).toBe('sig123');
    expect(trades[0].confirmedAt).not.toBeNull();
  });

  it('deposits insert and list newest-first', async () => {
    await repos.insertDeposit({ chatId: 900001, mint: 'SOL', amount: '500' });
    await repos.insertDeposit({ chatId: 900001, mint: 'SOL', amount: '1000' });
    const list = await repos.getDeposits(900001);
    expect(list).toHaveLength(2);
    expect(list[0].amount).toBe('1000');
  });

  it('balance snapshots upsert by (chat_id, address, mint)', async () => {
    await repos.saveSnapshots(900001, 'addrA', { SOL: '1', TOKEN: '2' });
    await repos.saveSnapshots(900001, 'addrA', { SOL: '3' });
    const snap = await repos.getSnapshots(900001, 'addrA');
    expect(snap.SOL).toBe('3');
    expect(snap.TOKEN).toBe('2'); // untouched mint preserved
    // Multi-wallet isolation:
    await repos.saveSnapshots(900001, 'addrB', { SOL: '9' });
    expect((await repos.getSnapshots(900001, 'addrA')).SOL).toBe('3');
    expect((await repos.getSnapshots(900001, 'addrB')).SOL).toBe('9');
  });

  it('counts trades/deposits for the last 24h', async () => {
    expect(await repos.countTradesToday()).toBe(1);
    expect(await repos.countDepositsToday()).toBe(2);
  });

  it('wallet uniqueness is enforced', async () => {
    await expect(
      repos.saveWallet({
        chatId: 900002,
        address: 'WalletAddress111111111111111111111111111111111',
        encryptedSecret: {},
        derivation: 'private_key',
        walletNumber: 1,
        type: 'generated',
      }),
    ).rejects.toThrow();
  });

  it('wallet numbers increment atomically per user', async () => {
    await repos.ensureUser(900003);
    expect(await repos.nextWalletNumber(900003)).toBe(1);
    expect(await repos.nextWalletNumber(900003)).toBe(2);
    expect(await repos.nextWalletNumber(900003)).toBe(3);

    await repos.ensureUser(900004);
    expect(await repos.nextWalletNumber(900004)).toBe(1); // independent counter
  });

  it('hasUser distinguishes new from existing users', async () => {
    expect(await repos.hasUser(900005)).toBe(false);
    await repos.ensureUser(900005);
    expect(await repos.hasUser(900005)).toBe(true);
  });

  it('records admin events with a trace id and retrievable payload', async () => {
    await repos.insertAdminEvent('wallet_generated', 'abcdef12', { user: 900001, walletNumber: 1 });
    const rows = await database.pool.query('SELECT * FROM admin_events ORDER BY id DESC LIMIT 1');
    expect(rows.rows[0].event_type).toBe('wallet_generated');
    expect(rows.rows[0].trace_id).toBe('abcdef12');
    expect(rows.rows[0].payload).toMatchObject({ user: 900001, walletNumber: 1 });
  });
});
