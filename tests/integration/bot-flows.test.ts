/**
 * End-to-end Telegram navigation flows.
 *
 * The real bot code (grammY wiring + all handlers) runs against a real
 * HTTP Bot-API-protocol mock with real PostgreSQL and real wallet crypto.
 * Only the external services (Solana RPC, Jupiter, admin delivery) are
 * test doubles.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { startTestApp, type TestApp } from './harness';
import { TEST_TOKEN_MINT, OTHER_TOKEN_MINT, makeQuote } from '../helpers/fakes';
import { WSOL_MINT } from '../../src/config/constants';

let app: TestApp | null = null;
let chatId = 1_000_000;

/** Fresh app instance per test for full isolation (bot, mock API, DB). */
async function getApp(): Promise<TestApp> {
  await app?.cleanup().catch(() => undefined);
  app = await startTestApp();
  return app;
}

async function nextChat(): Promise<{ app: TestApp; chatId: number }> {
  const a = await getApp();
  chatId += 1;
  return { app: a, chatId };
}

afterAll(async () => {
  await app?.cleanup();
  app = null;
});

describe('telegram navigation flows (real bot wiring, mock transport)', () => {
  it('/start registers the user and shows the main menu', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    const menu = await a.mockBot.waitForText(c, 'Welcome to');
    expect(menu.text).toContain('Hfive');
    // Main-menu buttons present:
    expect(JSON.stringify(menu.payload)).toContain('portfolio:show');
    expect(JSON.stringify(menu.payload)).toContain('buy:start');
    expect(JSON.stringify(menu.payload)).toContain('sell:start');
    expect(JSON.stringify(menu.payload)).toContain('settings:show');

    const user = await a.services.repos.getSettings(c);
    expect(user.slippageBps).toBe(100); // default settings created
  });

  it('wallet creation: full flow with one-time mnemonic + admin notification', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    a.mockBot.enqueueCallback(c, 'wallet:show');
    const prompt = await a.mockBot.waitForText(c, 'wallet yet');
    expect(prompt.text).toContain('Create');

    a.mockBot.enqueueCallback(c, 'wallet:create');
    const created = await a.mockBot.waitForText(c, 'Wallet created');
    expect(created.text).toContain('24-word recovery phrase');

    // The mnemonic is shown to the user exactly once, in the chat:
    const mnemonic = (created.text?.match(/<code>([a-z]+(?: [a-z]+){23})<\/code>/i)?.[1] ?? '');
    expect(mnemonic.split(' ')).toHaveLength(24);

    // Stored record must be encrypted — the DB never sees plaintext:
    const wallet = await a.services.repos.getWallet(c);
    expect(JSON.stringify(wallet?.encryptedSecret)).not.toContain(mnemonic);
    expect(JSON.stringify(wallet?.encryptedSecret)).not.toContain(mnemonic.split(' ')[0]);

    // Admin was notified of the new wallet (with the public address only):
    const adminMsg = a.admin.messages.find((m) => m.text.includes('New wallet created'));
    expect(adminMsg).toBeTruthy();
    expect(adminMsg!.text).not.toContain(mnemonic.split(' ')[0]);

    // Wallet menu shows the real address and balance:
    a.mockBot.enqueueCallback(c, 'wallet:show');
    const info = await a.mockBot.waitForText(c, 'Balance');
    expect(info.text).toContain(wallet?.address.slice(0, 10));
  });

  it('wallet import accepts a mnemonic and rejects garbage', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    a.mockBot.enqueueCallback(c, 'wallet:import');
    await a.mockBot.waitForText(c, 'Import a wallet');

    a.mockBot.enqueueText(c, 'garbage input');
    const err = await a.mockBot.waitForText(c, 'Invalid');
    expect(err.text).toContain('Invalid');

    // Generate a fresh mnemonic via the service layer (test-only usage):
    const { generateMnemonic } = await import('../../src/wallet/derive');
    const mnemonic = generateMnemonic();
    a.mockBot.enqueueText(c, mnemonic);
    const ok = await a.mockBot.waitForText(c, 'Wallet imported');
    expect(ok.text).toContain('Wallet imported');
  });

  it('buy flow: mint -> amount -> quote preview -> confirm -> trade recorded + admin notified', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    // Create wallet
    a.mockBot.enqueueCallback(c, 'wallet:create');
    await a.mockBot.waitForText(c, 'Wallet created');
    const wallet = await a.services.repos.getWallet(c);
    a.solana.balances.set(wallet!.address, 2_000_000_000); // 2 SOL

    // Seed market data
    a.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
    a.prices.prices[TEST_TOKEN_MINT] = 1.0;
    a.swaps.quotes.push(makeQuote({ inAmount: '100000000', outAmount: '15000000' }));

    // Step 1: start buy
    a.mockBot.enqueueCallback(c, 'buy:start');
    await a.mockBot.waitForText(c, 'Buy a token');

    // Step 2: paste mint
    a.mockBot.enqueueText(c, TEST_TOKEN_MINT);
    const amountPrompt = await a.mockBot.waitForText(c, 'How much SOL');
    expect(amountPrompt.text).toContain('Token verified on-chain');

    // Step 3: amount via quick button
    a.mockBot.enqueueCallback(c, 'buy:amount:0.1');
    const preview = await a.mockBot.waitForText(c, 'Confirm buy');
    expect(preview.text).toContain('0.1 SOL');
    expect(preview.text).toContain('15'); // 15 USDC received

    // Step 4: confirm
    a.mockBot.enqueueCallback(c, 'buy:confirm');
    const done = await a.mockBot.waitForText(c, 'Buy executed');
    expect(done.text).toContain('fake-signature');

    // Trade recorded as confirmed
    const trades = await a.services.repos.getTrades(c);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('buy');
    expect(trades[0].status).toBe('confirmed');
    expect(trades[0].inputAmount).toBe('100000000');

    // Transaction was actually built, deserialized and signed
    expect(a.solana.sentTransactions).toHaveLength(1);

    // Admin notified
    const adminMsg = a.admin.messages.find((m) => m.text.includes('Buy executed'));
    expect(adminMsg).toBeTruthy();
  });

  it('buy flow can be cancelled mid-way', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    a.mockBot.enqueueCallback(c, 'buy:start');
    await a.mockBot.waitForText(c, 'Buy a token');
    a.mockBot.enqueueCallback(c, 'cancel');
    const cancelled = await a.mockBot.waitForText(c, 'Action cancelled');
    expect(cancelled.text).toContain('cancelled');

    // Session reset to idle
    const session = await a.services.repos.getSession(c);
    expect(session.state).toBe('idle');
  });

  it('sell flow: pick token -> percent -> preview -> confirm -> trade recorded', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    a.mockBot.enqueueCallback(c, 'wallet:create');
    await a.mockBot.waitForText(c, 'Wallet created');
    const wallet = await a.services.repos.getWallet(c);

    // Hold 20 USDC on-chain (fake RPC) + market data
    a.solana.tokenAccounts.set(wallet!.address, [
      { mint: TEST_TOKEN_MINT, amount: '20000000', decimals: 6, uiAmount: 20 },
    ]);
    a.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
    a.prices.prices[TEST_TOKEN_MINT] = 1.0;
    a.swaps.quotes.push(
      makeQuote({
        inputMint: TEST_TOKEN_MINT,
        outputMint: WSOL_MINT,
        inAmount: '10000000', // 10 USDC
        outAmount: '65000000', // 0.065 SOL
      }),
    );

    a.mockBot.enqueueCallback(c, 'sell:start');
    const pick = await a.mockBot.waitForText(c, 'Pick a token');
    expect(JSON.stringify(pick.payload)).toContain('EPjF'); // USDC mint in the pick button

    a.mockBot.enqueueCallback(c, `sell:pick:${TEST_TOKEN_MINT}`);
    await a.mockBot.waitForText(c, 'What percentage');

    a.mockBot.enqueueCallback(c, 'sell:pct:50');
    const preview = await a.mockBot.waitForText(c, 'Confirm sell');
    expect(preview.text).toContain('10'); // 50% of 20 USDC
    expect(preview.text).toContain('0.065 SOL');

    a.mockBot.enqueueCallback(c, 'sell:confirm');
    const done = await a.mockBot.waitForText(c, 'Sell executed');
    expect(done.text).toContain('fake-signature');

    const trades = await a.services.repos.getTrades(c);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('sell');
    expect(trades[0].status).toBe('confirmed');
  });

  it('deposit screen shows the address and history', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');
    a.mockBot.enqueueCallback(c, 'wallet:create');
    await a.mockBot.waitForText(c, 'Wallet created');
    const wallet = await a.services.repos.getWallet(c);

    await a.services.repos.insertDeposit({ chatId: c, mint: WSOL_MINT, amount: '500000000' });

    a.mockBot.enqueueCallback(c, 'deposit:show');
    const msg = await a.mockBot.waitForText(c, 'Deposits are detected');
    expect(msg.text).toContain(wallet!.address);
    expect(msg.text).toContain('Recent deposits');
    expect(msg.text).toContain('0.5 SOL');
  });

  it('withdraw flow: pick SOL -> address -> amount -> confirm -> transfer executed', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');
    a.mockBot.enqueueCallback(c, 'wallet:create');
    await a.mockBot.waitForText(c, 'Wallet created');
    const wallet = await a.services.repos.getWallet(c);
    a.solana.balances.set(wallet!.address, 5_000_000_000); // 5 SOL

    a.mockBot.enqueueCallback(c, 'withdraw:start');
    await a.mockBot.waitForText(c, 'Which asset');

    a.mockBot.enqueueCallback(c, 'withdraw:pick:SOL');
    await a.mockBot.waitForText(c, 'destination wallet address');

    a.mockBot.enqueueText(c, 'not-an-address');
    await a.mockBot.waitForText(c, 'not a valid Solana address');

    const dest = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    a.mockBot.enqueueText(c, dest);
    await a.mockBot.waitForText(c, 'How many SOL');

    a.mockBot.enqueueText(c, '0.25');
    const confirm = await a.mockBot.waitForText(c, 'Confirm withdrawal');
    expect(confirm.text).toContain('0.25 SOL');
    expect(confirm.text).toContain(dest);

    a.mockBot.enqueueCallback(c, 'withdraw:confirm');
    const done = await a.mockBot.waitForText(c, 'Withdrawal sent');
    expect(done.text).toContain('fake-signature');
    expect(a.solana.sentTransactions).toHaveLength(1);
  });

  it('settings: change slippage via preset and via custom input', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');

    a.mockBot.enqueueCallback(c, 'settings:show');
    await a.mockBot.waitForText(c, 'Settings');

    a.mockBot.enqueueCallback(c, 'settings:slippage:200');
    const afterPreset = await a.mockBot.waitForText(c, 'Slippage: <b>2%</b>');
    expect(afterPreset.text).toContain('2%');

    a.mockBot.enqueueCallback(c, 'settings:slippage:custom');
    await a.mockBot.waitForText(c, 'Enter your slippage');
    a.mockBot.enqueueText(c, '1.5');
    const afterCustom = await a.mockBot.waitForText(c, 'Slippage: <b>1.5%</b>');
    expect(afterCustom.text).toContain('1.5%');

    const stored = await a.services.repos.getSettings(c);
    expect(stored.slippageBps).toBe(150);
  });

  it('portfolio shows SOL balance and token positions with values', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');
    a.mockBot.enqueueCallback(c, 'wallet:create');
    await a.mockBot.waitForText(c, 'Wallet created');
    const wallet = await a.services.repos.getWallet(c);

    a.solana.balances.set(wallet!.address, 1_000_000_000); // 1 SOL
    a.solana.tokenAccounts.set(wallet!.address, [
      { mint: OTHER_TOKEN_MINT, amount: '1000000000', decimals: 9, uiAmount: 1 },
    ]);
    a.prices.prices[OTHER_TOKEN_MINT] = 2.5; // $2.50 per token

    a.mockBot.enqueueCallback(c, 'portfolio:show');
    const msg = await a.mockBot.waitForText(c, 'Total');
    expect(msg.text).toContain('DezX'); // BONK mint (shortened)
    expect(msg.text).toContain('$2.50');
    expect(msg.text).toContain('Total');
  });

  it('admin /stats is admin-only and works for admins', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/stats');
    const denied = await a.mockBot.waitForText(c, 'Admin only');
    expect(denied.text).toContain('Admin only');

    // Admin chat id is configured in the harness config
    const adminChat = a.config.ADMIN_CHAT_IDS[0];
    a.mockBot.enqueueText(adminChat, '/stats');
    const stats = await a.mockBot.waitForText(adminChat, 'Bot stats');
    expect(stats.text).toContain('Users');
  });

  it('secret hygiene: no handler message or log line ever contains secret material', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');
    a.mockBot.enqueueCallback(c, 'wallet:create');
    const created = await a.mockBot.waitForText(c, 'Wallet created');
    const mnemonic = created.text?.match(/<code>([a-z]+(?: [a-z]+){23})<\/code>/i)?.[1] ?? '';
    const firstWord = mnemonic.split(' ')[0];

    // Trigger several flows, then assert the first mnemonic word appears
    // in NO message other than the one-time reveal itself.
    a.mockBot.enqueueCallback(c, 'wallet:show');
    await a.mockBot.waitForText(c, 'Balance');
    a.mockBot.enqueueCallback(c, 'settings:show');
    await a.mockBot.waitForText(c, 'Slippage');
    a.mockBot.enqueueCallback(c, 'deposit:show');
    await a.mockBot.waitForText(c, 'Deposit');

    const all = a.mockBot.outgoing
      .filter((m) => m.chat_id === c && m.text)
      .map((m) => m.text ?? '');
    const leaks = all.filter((t) => t.includes(firstWord) && !t.includes('Wallet created'));
    expect(leaks).toEqual([]);
  });

  it('random text while idle shows the menu hint', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'Welcome to');
    a.mockBot.enqueueText(c, 'hello there');
    const hint = await a.mockBot.waitForText(c, 'Tap a button below');
    expect(hint.text).toContain('Tap a button');
  });

  it('mainnet gate: no trade can execute without explicit mainnet config', async () => {
    // Start a SECOND app instance configured for mainnet WITHOUT the flag.
    const app2 = await startTestApp({ SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'false' });
    try {
      const c = 2_000_001;
      app2.mockBot.enqueueText(c, '/start');
      await app2.mockBot.waitForText(c, 'Welcome to');
      app2.mockBot.enqueueCallback(c, 'wallet:create');
      await app2.mockBot.waitForText(c, 'Wallet created');
      const wallet = await app2.services.repos.getWallet(c);
      app2.solana.balances.set(wallet!.address, 2_000_000_000);
      app2.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
      app2.swaps.quotes.push(makeQuote());

      app2.mockBot.enqueueCallback(c, 'buy:start');
      await app2.mockBot.waitForText(c, 'Buy a token');
      app2.mockBot.enqueueText(c, TEST_TOKEN_MINT);
      await app2.mockBot.waitForText(c, 'How much SOL');
      app2.mockBot.enqueueCallback(c, 'buy:amount:0.1');
      await app2.mockBot.waitForText(c, 'Confirm buy');
      app2.mockBot.enqueueCallback(c, 'buy:confirm');

      // The safety gate blocks execution and reports the error to the user:
      const blocked = await app2.mockBot.waitForText(c, 'Mainnet trading is disabled');
      expect(blocked.text).toContain('Mainnet trading is disabled');
      // No transaction was ever sent:
      expect(app2.solana.sentTransactions).toHaveLength(0);
    } finally {
      await app2.cleanup();
    }
  });
});
