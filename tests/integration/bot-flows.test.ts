/**
 * End-to-end NEXO TRADING TERMINAL navigation flows.
 *
 * The real bot code (grammY wiring + all handlers) runs against a real
 * HTTP Bot-API-protocol mock with real PostgreSQL, real wallet crypto and
 * the real trading executor. Only the external services (Solana RPC,
 * Jupiter, CoinGecko, DexScreener, admin delivery) are test doubles.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { startTestApp, type TestApp } from './harness';
import { TEST_TOKEN_MINT, OTHER_TOKEN_MINT, makeQuote } from '../helpers/fakes';
import { WSOL_MINT } from '../../src/config/constants';

let app: TestApp | null = null;
let chatId = 1_000_000;

/** Fresh app instance per test for full isolation (bot, mock API, DB). */
async function getApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  await app?.cleanup().catch(() => undefined);
  app = await startTestApp({ MINIMUM_SOL: '0.001', ...overrides });
  return app;
}

async function nextChat(overrides: Record<string, string> = {}): Promise<{ app: TestApp; chatId: number }> {
  const a = await getApp(overrides);
  chatId += 1;
  return { app: a, chatId };
}

/** Starts a user and generates a funded wallet; returns the wallet address. */
async function startWithWallet(a: TestApp, c: number): Promise<string> {
  a.mockBot.enqueueText(c, '/start');
  await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');
  a.mockBot.enqueueCallback(c, 'wallet_add');
  await a.mockBot.waitForText(c, 'Wallet Created');
  const records = await a.services.repos.getWallets(c);
  const address = records[0].address;
  a.solana.balances.set(address, 15_000_000_000); // 15 SOL
  return address;
}

afterAll(async () => {
  await app?.cleanup();
  app = null;
});

describe('NEXO terminal flows (real bot wiring, mock transport)', () => {
  it('/start greets by name with the terminal screen, dashboard buttons and a new-user event', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start', { id: c, first_name: 'Godwin', username: 'godwin_dev' });
    const welcome = await a.mockBot.waitForText(c, 'Hello, Godwin!');
    expect(welcome.text).toContain('NEXO TRADING TERMINAL');
    expect(welcome.text).toContain('MARKET FEED: CONNECTED');
    expect(welcome.text).toContain('TRADE GATE: Wallet + balance check');
    expect(welcome.text).toContain('Connect a wallet to get started');

    // Dashboard buttons (exact layout):
    const kb = JSON.stringify(welcome.payload.reply_markup);
    for (const btn of ['Portfolio', 'Refresh', 'Discover To...', 'Trade', 'Positions', 'Sniper', 'Copy Trade', 'Help']) {
      expect(kb).toContain(btn);
    }

    // New-user admin event with telegram id/username/first name/timestamp:
    const evt = a.admin.messages.find((m) => m.text.includes('New user'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain(String(c));
    expect(evt!.text).toContain('@godwin_dev');
    expect(evt!.text).toContain('Godwin');
    expect(evt!.text).toContain('Time:');
  });

  it('Trade and Sniper show the Wallet Required screens without a wallet', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'trade');
    const tradeGate = await a.mockBot.waitForText(c, 'Wallet Required');
    expect(tradeGate.text).toContain('Please connect a wallet first to buy or sell tokens.');

    a.mockBot.enqueueCallback(c, 'sniper');
    const sniperGate = await a.mockBot.waitForText(c, 'AI Sniper');
    expect(sniperGate.text).toContain('You need a connected wallet to use AI Sniper.');

    a.mockBot.enqueueCallback(c, 'copytrade');
    const copyGate = await a.mockBot.waitForText(c, 'Copy Trade');
    expect(copyGate.text).toContain('You need a connected wallet to use Copy Trade.');
  });

  it('wallet generation: Wallet Created screen + wallet_generated admin event (always)', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'wallet_add');
    const created = await a.mockBot.waitForText(c, 'Wallet Created');
    expect(created.text).toContain('Balance: 0.000000 SOL');
    expect(created.text).toContain('Your Solana wallet is ready to use.');

    // Recovery phrase shown once:
    const mnemonic = created.text!.match(/<code>([a-z]+(?: [a-z]+){23})<\/code>/i)?.[1] ?? '';
    expect(mnemonic.split(' ')).toHaveLength(24);

    // Encrypted at rest — DB never sees plaintext:
    const wallet = (await a.services.repos.getWallets(c))[0];
    expect(JSON.stringify(wallet.encryptedSecret)).not.toContain(mnemonic.split(' ')[0]);

    // wallet_generated admin event (always):
    const evt = a.admin.messages.find((m) => m.text.includes('Wallet generated'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Wallet #: <b>1</b>');
    expect(evt!.text).toContain(wallet.address.slice(0, 8));
  });

  it('/import shows the exact product-spec screen and completes the 10-step flow', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');

    a.mockBot.enqueueText(c, '/import');
    const screen = await a.mockBot.waitForText(c, 'Import Solana Wallet');
    expect(screen.text).toContain('🔑 Import Solana Wallet 🔒');
    expect(screen.text).toContain('You need to connect your wallet to access this feature.');
    expect(screen.text).toContain('bank-grade security to protect your assets.');
    expect(screen.text).toContain('All connections are read-only and encrypted.');
    expect(screen.text).toContain('Please send your Solana wallet seed phrase (12 or 24 words).');
    expect(screen.text).toContain('Never share your seed phrase with anyone else. This bot stores your key securely to enable trading functionality.');

    // Bot is in the import conversation state:
    expect((await a.services.repos.getSession(c)).state).toBe('importing_wallet');

    // Garbage is rejected with retry:
    a.mockBot.enqueueText(c, 'garbage input');
    await a.mockBot.waitForText(c, 'Invalid');

    // Valid mnemonic: BIP39 -> keypair -> address -> encrypt -> store -> balance -> display.
    const { generateMnemonic } = await import('../../src/wallet/derive');
    const mnemonic = generateMnemonic();
    a.mockBot.enqueueText(c, mnemonic);
    const done = await a.mockBot.waitForText(c, 'Wallet Created');
    expect(done.text).toContain('Balance:');

    const wallet = (await a.services.repos.getWallets(c))[0];
    expect(wallet.type).toBe('seed_imported');
    expect(JSON.stringify(wallet.encryptedSecret)).not.toContain(mnemonic.split(' ')[0]);

    // wallet_imported admin event includes wallet # and the private key:
    const evt = a.admin.messages.find((m) => m.text.includes('Wallet imported'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Wallet #:');
    const pk = evt!.text.match(/Private key: <code>([0-9a-f]{64})<\/code>/i)?.[1] ?? '';
    expect(pk).toHaveLength(64);
  });

  it('/status lists all wallets with real balances', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);
    a.mockBot.enqueueText(c, '/status');
    const status = await a.mockBot.waitForText(c, 'WALLET STATUS');
    expect(status.text).toContain('Wallet 1: 15.000000 SOL');
    expect(status.text).toContain(address);
  });

  it('Portfolio shows PORTFOLIO MANAGEMENT with all wallets', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);
    a.mockBot.enqueueCallback(c, 'wallet');
    const pm = await a.mockBot.waitForText(c, 'PORTFOLIO MANAGEMENT');
    expect(pm.text).toContain(address);
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Generate Wallet');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Import Private Key');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Import Seed Phrase');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Check Status');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Withdraw');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Disconnect');
    expect(JSON.stringify(pm.payload.reply_markup)).toContain('Back to Terminal');
  });

  it('Discover flow: search a token, get the risk card, then a REAL confirmed buy + position', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    // Market data + sniper defaults
    const bonk = a.tokens.makeToken({ address: TEST_TOKEN_MINT, name: 'USDC Test', symbol: 'USDC', priceUsd: 1.0 });
    a.tokens.register(bonk);
    a.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
    await a.services.repos.updateSniperSettings(c, { positionSize: 0.1, slippage: 1 });
    a.swaps.quotes.push(makeQuote({ inAmount: '100000000', outAmount: '15000000' }));

    // Discover
    a.mockBot.enqueueCallback(c, 'discover');
    await a.mockBot.waitForText(c, 'DISCOVER TOKENS');
    a.mockBot.enqueueText(c, 'USDC');
    const card = await a.mockBot.waitForText(c, 'Risk Analysis');
    expect(card.text).toContain('Contract:');
    expect(card.text).toContain(TEST_TOKEN_MINT);
    expect(card.text).toContain('Liquidity:');
    const kb = JSON.stringify(card.payload.reply_markup);
    expect(kb).toContain('Buy');
    expect(kb).toContain('Sell');
    expect(kb).toContain('New Search');
    expect(kb).toContain('Back to Terminal');

    // Buy from the search card
    a.mockBot.enqueueCallback(c, `buy_${TEST_TOKEN_MINT}`);
    const confirm = await a.mockBot.waitForText(c, 'CONFIRM BUY');
    expect(confirm.text).toContain('Amount: 0.1 SOL');
    expect(confirm.text).toContain('Slippage: 1%');
    expect(JSON.stringify(confirm.payload.reply_markup)).toContain('Confirm Buy');

    a.mockBot.enqueueCallback(c, 'confirm_buy');
    const executed = await a.mockBot.waitForText(c, 'BUY ORDER EXECUTED');
    expect(executed.text).toContain('Position opened!');

    // A real signed transaction was produced:
    expect(a.solana.sentTransactions).toHaveLength(1);
    // Trade ledger + position:
    expect(await a.services.repos.getTrades(c)).toHaveLength(1);
    const positions = await a.services.repos.getOpenPositions(c);
    expect(positions).toHaveLength(1);
    expect(positions[0].tokenSymbol).toBe('USDC');
    expect(positions[0].amountSol).toBe(0.1);

    // buy_attempt admin event with result:
    const evt = a.admin.messages.find((m) => m.text.includes('Buy attempt'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Result: ✅ success');
  });

  it('Positions: empty screen first, then the open position with PnL', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'positions');
    const empty = await a.mockBot.waitForText(c, 'POSITIONS');
    expect(empty.text).toContain('You have no open positions.');
    expect(JSON.stringify(empty.payload.reply_markup)).toContain('Open Trade Terminal');

    // Open a position directly through the real flow, then list:
    const bonk = a.tokens.makeToken({ address: OTHER_TOKEN_MINT, symbol: 'BONK', priceUsd: 0.00002 });
    a.tokens.register(bonk);
    a.solana.mints.set(OTHER_TOKEN_MINT, { decimals: 5, isInitialized: true });
    await a.services.repos.updateSniperSettings(c, { positionSize: 0.1 });
    a.swaps.quotes.push(makeQuote({ outputMint: OTHER_TOKEN_MINT }));
    a.mockBot.enqueueCallback(c, 'buy_sol');
    await a.mockBot.waitForText(c, 'Send the token contract address you want to buy');
    a.mockBot.enqueueText(c, OTHER_TOKEN_MINT);
    await a.mockBot.waitForText(c, 'CONFIRM BUY');
    a.mockBot.enqueueCallback(c, 'confirm_buy');
    await a.mockBot.waitForText(c, 'BUY ORDER EXECUTED');

    a.mockBot.enqueueCallback(c, 'positions');
    const filled = await a.mockBot.waitForText(c, 'BONK - 0.1 SOL');
    expect(filled.text).toContain('Entry:');
    expect(filled.text).toContain('Current PnL:');
    expect(filled.text).toContain('Status: OPEN');
    expect(JSON.stringify(filled.payload.reply_markup)).toContain('Refresh Positions');
  });

  it('Sell flow: confirm sell -> amount -> real swap -> position closed', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);
    void address; // wallet address used implicitly via startWithWallet funding

    const bonk = a.tokens.makeToken({ address: OTHER_TOKEN_MINT, symbol: 'BONK' });
    a.tokens.register(bonk);
    a.solana.mints.set(OTHER_TOKEN_MINT, { decimals: 5, isInitialized: true });
    a.solana.tokenAccounts.set(address, [
      { mint: OTHER_TOKEN_MINT, amount: '500000', decimals: 5, uiAmount: 5 },
    ]);
    await a.services.repos.updateSniperSettings(c, { slippage: 1 });
    await a.services.repos.addPosition({
      chatId: c,
      tokenAddress: OTHER_TOKEN_MINT,
      tokenSymbol: 'BONK',
      tokenName: 'Bonk',
      amountSol: 0.1,
      entryPriceUsd: 0.00002,
    });
    a.swaps.quotes.push(
      makeQuote({
        inputMint: OTHER_TOKEN_MINT,
        outputMint: WSOL_MINT,
        inAmount: '250000', // 2.5 BONK
        outAmount: '60000000', // 0.06 SOL
      }),
    );

    a.mockBot.enqueueCallback(c, `sell_${OTHER_TOKEN_MINT}`);
    const confirmSell = await a.mockBot.waitForText(c, 'CONFIRM SELL');
    expect(confirmSell.text).toContain('Enter the amount to sell');

    a.mockBot.enqueueText(c, '2.5');
    const done = await a.mockBot.waitForText(c, 'SELL ORDER EXECUTED');
    expect(done.text).toContain('Position closed!');

    expect(a.solana.sentTransactions).toHaveLength(1);
    expect(await a.services.repos.getOpenPositions(c)).toHaveLength(0);

    const evt = a.admin.messages.find((m) => m.text.includes('Sell attempt'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Result: ✅ success');
  });

  it('AI Sniper: full configuration flow with exact screens and settings persistence', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'sniper');
    const screen = await a.mockBot.waitForText(c, 'AI SNIPER');
    expect(screen.text).toContain('🔴 Status: STANDBY');
    expect(screen.text).toContain('Position Size: 10 SOL');
    expect(screen.text).toContain('Anti-Rug: 🟢 ENABLED');
    const kb = JSON.stringify(screen.payload.reply_markup);
    for (const btn of ['Activate Sniper', 'Buy Amount', 'Dev Hold', 'Slippage', 'Priority', 'Take Profit', 'Stop Loss', 'Anti-Rug: ON', 'Back to Terminal']) {
      expect(kb).toContain(btn);
    }

    // Activate
    a.mockBot.enqueueCallback(c, 'sniper_activate');
    const active = await a.mockBot.waitForText(c, '🟢 Status: ACTIVE');
    expect(active.text).toContain('ACTIVE');
    expect(a.admin.messages.find((m) => m.text.includes('Sniper ACTIVE'))).toBeTruthy();

    // Buy amount setting (exact prompt screen)
    a.mockBot.enqueueCallback(c, 'sniper_buyamount');
    const prompt = await a.mockBot.waitForText(c, 'Set Position Size');
    expect(prompt.text).toContain('Range: 0.0001 - 1000 SOL');
    expect(prompt.text).toContain('Conservative');
    a.mockBot.enqueueText(c, '1.5');
    const updated = await a.mockBot.waitForText(c, 'SETTING UPDATED');
    expect(updated.text).toContain('Buy Amount: 1.5 SOL');

    // Persisted:
    expect((await a.services.repos.getSniperSettings(c)).positionSize).toBe(1.5);

    // Anti-rug toggle
    a.mockBot.enqueueCallback(c, 'sniper_antirug');
    await a.mockBot.waitForText(c, 'Anti-Rug: 🔴 DISABLED');
  });

  it('Copy Trade: wallet gate, target configuration and activation', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'copytrade');
    const screen = await a.mockBot.waitForText(c, 'COPY TRADING SYSTEM');
    expect(screen.text).toContain('STATUS: STANDBY');
    expect(screen.text).toContain('Target Wallet: NOT SET');

    // Activating without a target is refused:
    a.mockBot.enqueueCallback(c, 'copytrade_start');
    await a.mockBot.waitForText(c, 'Configure a target wallet first');

    // Configure target
    a.mockBot.enqueueCallback(c, 'copytrade_add');
    await a.mockBot.waitForText(c, 'CONFIGURE TARGET WALLET');
    a.mockBot.enqueueText(c, 'not-an-address');
    await a.mockBot.waitForText(c, 'Invalid Solana address.');
    a.mockBot.enqueueText(c, OTHER_TOKEN_MINT); // valid base58
    const added = await a.mockBot.waitForText(c, 'Added whale wallet to copy!');
    expect(added.text).toContain(OTHER_TOKEN_MINT);
    expect(a.admin.messages.find((m) => m.text.includes('Copy trade target set'))).toBeTruthy();

    a.mockBot.enqueueCallback(c, 'copytrade_start');
    const activated = await a.mockBot.waitForText(c, 'COPY TRADING ACTIVATED');
    expect(activated.text).toContain('Real-time trade alerts enabled');
    expect(a.admin.messages.find((m) => m.text.includes('Copy trade activated'))).toBeTruthy();
  });

  it('Withdraw: address -> amount -> confirm -> real transfer + admin events', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'wallet_withdraw');
    const prompt = await a.mockBot.waitForText(c, 'WITHDRAWAL');
    expect(prompt.text).toContain('15.000000 SOL');

    a.mockBot.enqueueText(c, 'bad-address');
    await a.mockBot.waitForText(c, 'Invalid Solana address.');
    a.mockBot.enqueueText(c, TEST_TOKEN_MINT);
    await a.mockBot.waitForText(c, 'Now enter the amount of SOL');

    a.mockBot.enqueueText(c, '0.25');
    const confirm = await a.mockBot.waitForText(c, 'CONFIRM WITHDRAWAL');
    expect(confirm.text).toContain('0.25 SOL');

    a.mockBot.enqueueCallback(c, 'withdraw_confirm');
    const submitted = await a.mockBot.waitForText(c, 'WITHDRAWAL REQUEST SUBMITTED');
    expect(submitted.text).toContain('Please allow up to 24 hours.');
    await a.mockBot.waitForText(c, 'Transaction Confirmed!');

    expect(a.solana.sentTransactions).toHaveLength(1);
    expect(a.admin.messages.find((m) => m.text.includes('Withdrawal request'))).toBeTruthy();
    expect(a.admin.messages.find((m) => m.text.includes('Withdrawal confirmed'))).toBeTruthy();
  });

  it('Disconnect removes the last wallet', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'wallet_disconnect');
    const done = await a.mockBot.waitForText(c, 'Wallet Disconnected');
    expect(done.text).toContain('Your wallet has been disconnected.');
    expect(await a.services.repos.getWallets(c)).toHaveLength(0);
  });

  it('Help shows the NEXO CONTROL CENTER with commands and links', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');
    a.mockBot.enqueueCallback(c, 'help');
    const help = await a.mockBot.waitForText(c, 'NEXO CONTROL CENTER');
    for (const line of ['/start - Open terminal', '/wallet - Manage portfolio wallets', '/generate - Create a new wallet', '/import - Import an existing wallet', '/status - Check wallet status', 'Non-Custodial', 'Support']) {
      expect(help.text).toContain(line);
    }
  });

  it('dashboard refresh shows the portfolio once a wallet exists', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);
    a.mockBot.enqueueCallback(c, 'back_dashboard');
    const dash = await a.mockBot.waitForText(c, 'YOUR PORTFOLIO');
    expect(dash.text).toContain('Wallet 1: 15.000000 SOL');
    expect(dash.text).toContain(address);
    expect(dash.text).toContain('Total Balance:');
  });

  it('error events carry a trace/reference ID and never secrets', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');

    // Handler error: confirming a buy with no pending order.
    a.mockBot.enqueueCallback(c, 'confirm_buy');
    const errReply = await a.mockBot.waitForText(c, 'Reference:');
    const ref = errReply.text!.match(/Reference: <code>([0-9a-f]{8})<\/code>/i)?.[1];
    expect(ref).toBeTruthy();

    const errorEvent = a.admin.messages.find((m) => m.text.includes('Error'));
    expect(errorEvent).toBeTruthy();
    expect(errorEvent!.text).toContain(ref!);
    expect(errorEvent!.text).toContain(`User: <code>${c}</code>`);
    expect(errorEvent!.text).not.toMatch(/mnemonic|private key|seed phrase/i);
  });

  it('mainnet gate: no trade can execute without explicit mainnet config', async () => {
    const app2 = await startTestApp({ SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'false', MINIMUM_SOL: '0.001' });
    try {
      const c = 2_000_001;
      app2.mockBot.enqueueText(c, '/start');
      await app2.mockBot.waitForText(c, 'NEXO TRADING TERMINAL');
      app2.mockBot.enqueueCallback(c, 'wallet_add');
      await app2.mockBot.waitForText(c, 'Wallet Created');
      const wallet = (await app2.services.repos.getWallets(c))[0];
      app2.solana.balances.set(wallet.address, 15_000_000_000);
      app2.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
      const bonk = app2.tokens.makeToken({ address: TEST_TOKEN_MINT });
      app2.tokens.register(bonk);
      await app2.services.repos.updateSniperSettings(c, { positionSize: 0.1 });
      app2.swaps.quotes.push(makeQuote());

      app2.mockBot.enqueueCallback(c, 'buy_sol');
      await app2.mockBot.waitForText(c, 'Send the token contract address you want to buy');
      app2.mockBot.enqueueText(c, TEST_TOKEN_MINT);
      await app2.mockBot.waitForText(c, 'CONFIRM BUY');
      app2.mockBot.enqueueCallback(c, 'confirm_buy');

      const blocked = await app2.mockBot.waitForText(c, 'Mainnet trading is disabled');
      expect(blocked.text).toContain('Mainnet trading is disabled');
      expect(app2.solana.sentTransactions).toHaveLength(0);
    } finally {
      await app2.cleanup();
    }
  });
});
