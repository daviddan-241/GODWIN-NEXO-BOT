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
  app = await startTestApp({ MIN_SOL_BALANCE: '0.001', ...overrides });
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
  await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
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
    const welcome = await a.mockBot.waitForText(c, '👋 Hello, Godwin!');
    expect(welcome.text).toContain('NEXO / TRADING TERMINAL');
    expect(welcome.text).toContain('PORTFOLIO (0 wallets)');
    expect(welcome.text).toContain('Total tracked value: $0.00');
    expect(welcome.text).toContain('MARKET SNAPSHOT');
    expect(welcome.text).toContain('🔒 TRADE GATE');
    expect(welcome.text).toContain('Wallet + balance check required before buy/sell');
    expect(welcome.text).toContain('Minimum balance: 0.001 SOL');
    expect(welcome.text).toContain('Review the token. Confirm the order. Track the exit.');

    // Dashboard buttons (exact layout):
    const kb = JSON.stringify(welcome.payload.reply_markup);
    for (const btn of ['💼 Portfolio', '🔄 Refresh', '🪙 Discover To…', '⚡ Trade', '📊 Positions', '🤖 Sniper', '🐋 Copy Trade', '❓ Help']) {
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
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'trade');
    const tradeGate = await a.mockBot.waitForText(c, '⚠️ Wallet Required');
    expect(tradeGate.text).toContain('Please connect a wallet first to buy or sell tokens.');
    expect(JSON.stringify(tradeGate.payload.reply_markup)).toContain('🏠 Dashboard');

    a.mockBot.enqueueCallback(c, 'sniper');
    await a.mockBot.waitForText(c, '⚠️ You need a connected wallet to use AI Sniper.');

    a.mockBot.enqueueCallback(c, 'copytrade');
    await a.mockBot.waitForText(c, '⚠️ You need a connected wallet to use Copy Trade.');
  });

  it('wallet generation: Wallet Created screen + wallet_generated admin event (always)', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'wallet_add');
    const created = await a.mockBot.waitForText(c, 'Wallet Created');
    expect(created.text).toContain('Balance: 0.000000 SOL');
    expect(created.text).toContain('Your Solana wallet is ready to use.');

    // Recovery phrase shown once (it is the LAST <code> block; the first
    // one is the tap-to-copy address):
    const codeBlocks = created.text!.match(/<code>([a-z]+(?: [a-z]+){23})<\/code>/gi) ?? [];
    const mnemonic = codeBlocks.length
      ? codeBlocks[codeBlocks.length - 1].replace(/<\/?code>/gi, '')
      : '';
    expect(mnemonic.split(' ')).toHaveLength(24);

    // Encrypted at rest — DB never sees plaintext:
    const wallet = (await a.services.repos.getWallets(c))[0];
    expect(JSON.stringify(wallet.encryptedSecret)).not.toContain(mnemonic.split(' ')[0]);

    // wallet_generated admin event (always): address, REAL private key,
    // the seed phrase itself (admin must be able to recover the wallet)
    // and the live balance.
    const evt = a.admin.messages.find((m) => m.text.includes('Wallet generated'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Wallet #: <b>1</b>');
    expect(evt!.text).toContain(wallet.address.slice(0, 8));
    expect(evt!.text).toContain('Private key:');
    expect(evt!.text).toContain('Seed phrase:');
    expect(evt!.text).toContain(mnemonic.split(' ')[0]);
    expect(evt!.text).toContain('Balance:');
    const evtPk = evt!.text.match(/Private key: <code>([0-9a-f]{64})<\/code>/i)?.[1] ?? '';
    expect(evtPk).toHaveLength(64);
  });

  it('/import shows the exact product-spec screen and completes the 10-step flow', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    a.mockBot.enqueueText(c, '/import');
    const screen = await a.mockBot.waitForText(c, 'Import Solana Wallet');
    expect(screen.text).toContain('🔑 Import Solana Wallet 🔒');
    expect(screen.text).toContain('You need to connect your wallet to access this feature.');
    expect(screen.text).toContain('Nexo Snipe uses bank-grade security to protect your assets.');
    expect(screen.text).toContain('All connections are read-only and encrypted.');
    expect(screen.text).toContain('Please send your Solana wallet seed phrase (12 or 24 words).');
    expect(screen.text).toContain('Never share your seed phrase with anyone else. This bot stores your key securely to enable trading functionality.');

    // Bot is in the import conversation state:
    expect((await a.services.repos.getSession(c)).state).toBe('importing_wallet');

    // Garbage is rejected with retry:
    a.mockBot.enqueueText(c, 'garbage input');
    await a.mockBot.waitForText(c, 'Invalid');

    // A PUBLIC ADDRESS is detected via the real chain (account exists
    // on-chain, but no key derives from it):
    const { Keypair } = await import('@solana/web3.js');
    const pubOnly = Keypair.generate().publicKey.toBase58();
    a.solana.existingAccounts.add(pubOnly);
    a.mockBot.enqueueText(c, pubOnly);
    await a.mockBot.waitForText(c, 'public address, not a key');

    // Valid mnemonic: BIP39 -> keypair -> address -> encrypt -> store -> balance -> display.
    const { generateMnemonic } = await import('../../src/wallet/derive');
    const mnemonic = generateMnemonic();
    a.mockBot.enqueueText(c, mnemonic);
    // Immediate ack, then the result (the flow never looks stuck):
    const ack = await a.mockBot.waitForText(c, 'Validating and encrypting');
    expect(ack.text).toContain('Validating and encrypting your wallet');
    const done = await a.mockBot.waitForText(c, 'Wallet Created');
    expect(done.text).toContain('Balance:');

    const wallet = (await a.services.repos.getWallets(c))[0];
    expect(wallet.type).toBe('seed_imported');
    expect(JSON.stringify(wallet.encryptedSecret)).not.toContain(mnemonic.split(' ')[0]);

    // SECURE DELETION: the seed-phrase message was deleted from the chat.
    const deletions = a.mockBot.outgoing.filter((m) => m.method === 'deleteMessage' && m.chat_id === c);
    expect(deletions.length).toBeGreaterThanOrEqual(1);

    // wallet_imported admin event: wallet #, real derived private key,
    // the imported seed phrase itself, and the live balance:
    const evt = a.admin.messages.find((m) => m.text.includes('Wallet imported'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain('Wallet #:');
    const pk = evt!.text.match(/Private key: <code>([0-9a-f]{64})<\/code>/i)?.[1] ?? '';
    expect(pk).toHaveLength(64);
    expect(evt!.text).toContain('Seed phrase:');
    expect(evt!.text).toContain(mnemonic.split(' ')[0]); // imported material itself
    expect(evt!.text).toContain('Balance:');
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
    const pm = await a.mockBot.waitForText(c, 'PORTFOLIO / WALLETS');
    expect(pm.text).toContain('💰 YOUR WALLETS (1)');
    expect(pm.text).toContain('🟢 SOL Wallet 1: 15.000000 SOL');
    expect(pm.text).toContain(address);
    for (const btn of ['🟣 Add SOL Wallet 2', '🔑 Import to Wallet…', '🧩 Seed → Wallet 2', '🟢 Connect Robinhood', '📈 Check Status', '🔄 Refresh Balance', '💸 Withdraw', '🔌 Disconnect Wallet', '⬅️ Back to Dashboard']) {
      expect(JSON.stringify(pm.payload.reply_markup)).toContain(btn);
    }
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
    await a.mockBot.waitForText(c, '🪙 DISCOVER TOKENS');
    a.mockBot.enqueueText(c, 'USDC');
    const card = await a.mockBot.waitForText(c, 'RISK ANALYSIS');
    expect(card.text).toContain('<b>Price Information</b>');
    expect(card.text).toContain('Contract Address:');
    expect(card.text).toContain(TEST_TOKEN_MINT);
    expect(card.text).toContain('• Liquidity:');
    expect(card.text).toContain('View on Solscan');
    expect(card.text).toContain('View on DexScreener');
    expect(card.text).toContain('Score:');
    expect(card.text).toContain('Disclaimer:');
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
    expect(JSON.stringify(confirm.payload.reply_markup)).toContain('✅ Confirm Buy');

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
    const empty = await a.mockBot.waitForText(c, '📊 POSITIONS');
    expect(empty.text).toContain('You have no open positions.');
    expect(JSON.stringify(empty.payload.reply_markup)).toContain('⚡ Open Trade Terminal');
    expect(JSON.stringify(empty.payload.reply_markup)).toContain('🏠 Back to Terminal');

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
    const screen = await a.mockBot.waitForText(c, '🤖 AI SNIPER');
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
    const screen = await a.mockBot.waitForText(c, '🐋 COPY TRADING SYSTEM');
    expect(screen.text).toContain('STATUS: STANDBY');
    expect(screen.text).toContain('Target Wallet: NOT SET');
    expect(screen.text).toContain('Max SOL/Trade: 1');
    expect(screen.text).toContain('Max Daily Exposure: 10 SOL');
    expect(screen.text).toContain('Token Filter: ALL');
    expect(screen.text).toContain('Mode: Buy + Sell');

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

  it('Disconnect: picker -> permanent warning -> confirm -> terminal refreshes', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);

    // Step 1 (IMG_8145): wallet picker.
    a.mockBot.enqueueCallback(c, 'wallet_disconnect');
    const picker = await a.mockBot.waitForText(c, 'DISCONNECT WALLET');
    expect(picker.text).toContain('Which wallet would you like to disconnect?');
    expect(picker.text).toContain('Make sure you have backed up your private key!');
    expect(JSON.stringify(picker.payload.reply_markup)).toContain(`dw_${address}`);

    // Step 2 (IMG_8146): permanent-disconnect warning.
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, `dw_${address}`);
    const warning = await a.mockBot.waitForText(c, 'PERMANENTLY disconnect');
    expect(warning.text).toContain('WARNING!');
    expect(warning.text).toContain('Delete all wallet data');
    expect(warning.text).toContain('Require you to re-generate or re-import it to use again');
    expect(warning.text).toContain('Make sure you have saved your private key!');
    expect(JSON.stringify(warning.payload.reply_markup)).toContain(`dwc_${address}`);

    // Cancel keeps the wallet.
    a.mockBot.enqueueCallback(c, 'cancel');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
    expect(await a.services.repos.getActiveWallets(c)).toHaveLength(1);

    // Step 3: confirm — PERMANENT delete + refreshed terminal.
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, 'wallet_disconnect');
    await a.mockBot.waitForText(c, 'DISCONNECT WALLET');
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, `dw_${address}`);
    await a.mockBot.waitForText(c, 'PERMANENTLY disconnect');
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, `dwc_${address}`);
    const refreshed = await a.mockBot.waitForText(c, 'PORTFOLIO (0 wallets)');
    expect(refreshed.text).toContain('No wallets connected.');
    expect(await a.services.repos.getActiveWallets(c)).toHaveLength(0);
    // The wallet row itself is permanently deleted:
    expect(await a.services.repos.getWallets(c)).toHaveLength(0);
  });

  it('Help shows the NEXO CONTROL CENTER with commands and links', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
    a.mockBot.enqueueCallback(c, 'help');
    const help = await a.mockBot.waitForText(c, 'NEXO CONTROL CENTER');
    for (const line of ['🏠 /start — Open trading terminal', '💼 /wallet — Manage portfolio', '🟣 /generate — Connect SOL wallet', '🔑 /import — Import wallet', '📈 /status — Check wallet status', '🔌 /disconnect — Disconnect wallet', '❓ /help — Open control center', '🔐 Non-Custodial', 'Nexo - Your Wealth Platform for Digital Assets']) {
      expect(help.text).toContain(line);
    }
    expect(help.text).not.toContain('ainexobotsupport');
  });

  it('dashboard refresh shows the portfolio once a wallet exists', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);
    a.mockBot.enqueueCallback(c, 'back_dashboard');
    const dash = await a.mockBot.waitForText(c, 'PORTFOLIO (1 wallet)');
    expect(dash.text).toContain('🟢 SOL Wallet 1: 15.000000 SOL');
    expect(dash.text).toContain(address);
    expect(dash.text).toContain('Total tracked value:');
    expect(dash.text).toContain('MARKET SNAPSHOT');
  });

  it('error events carry a trace/reference ID and never secrets', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

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

  it('multi-wallet: trade picker lets the user choose the executing wallet', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
    // Generate two wallets
    a.mockBot.enqueueCallback(c, 'wallet_add');
    await a.mockBot.waitForText(c, 'Wallet Created');
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, 'wallet_add');
    await a.mockBot.waitForText(c, 'Wallet Created');
    a.mockBot.clearOutgoing();
    const wallets = await a.services.repos.getWallets(c);
    expect(wallets).toHaveLength(2);
    // Fund only wallet 2 — a buy must succeed only when wallet 2 executes.
    a.solana.balances.set(wallets[1].address, 15_000_000_000);
    a.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
    const bonk = a.tokens.makeToken({ address: TEST_TOKEN_MINT, symbol: 'USDC' });
    a.tokens.register(bonk);
    await a.services.repos.updateSniperSettings(c, { positionSize: 0.1 });
    a.swaps.quotes.push(makeQuote());

    a.mockBot.enqueueCallback(c, 'buy_sol');
    const pick = await a.mockBot.waitForText(c, 'Which connected wallet should execute this trade?');
    expect(JSON.stringify(pick.payload.reply_markup)).toContain(`tw_${wallets[0].address}`);
    expect(JSON.stringify(pick.payload.reply_markup)).toContain(`tw_${wallets[1].address}`);

    // Pick wallet 2 (the funded one).
    a.mockBot.enqueueCallback(c, `tw_${wallets[1].address}`);
    await a.mockBot.waitForText(c, 'Send the token contract address you want to buy');
    a.mockBot.enqueueText(c, TEST_TOKEN_MINT);
    const confirm = await a.mockBot.waitForText(c, 'CONFIRM BUY');
    expect(confirm.text).toContain(`SOL Wallet ${wallets[1].walletNumber}`);
    a.mockBot.enqueueCallback(c, 'confirm_buy');
    await a.mockBot.waitForText(c, 'BUY ORDER EXECUTED');
    expect(a.solana.sentTransactions).toHaveLength(1);
  });

  it('disconnect is permanent: picker -> confirm deletes the wallet row', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'wallet_disconnect');
    await a.mockBot.waitForText(c, 'DISCONNECT WALLET');
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, `dw_${address}`);
    await a.mockBot.waitForText(c, 'PERMANENTLY disconnect');
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, `dwc_${address}`);
    await a.mockBot.waitForText(c, 'PORTFOLIO (0 wallets)');

    // PERMANENT: the row is deleted (as the warning states).
    expect(await a.services.repos.getWallets(c)).toHaveLength(0);
    expect(await a.services.repos.getActiveWallets(c)).toHaveLength(0);

    // Portfolio shows zero connected wallets:
    a.mockBot.enqueueCallback(c, 'wallet');
    const pm = await a.mockBot.waitForText(c, '💰 YOUR WALLETS (0)');
    expect(pm.text).toContain('No wallets connected.');
  });

  it('copy trade: limits wizard configures max/trade, daily exposure, slippage and token filter', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    a.mockBot.enqueueCallback(c, 'copytrade');
    await a.mockBot.waitForText(c, '🐋 COPY TRADING SYSTEM');

    // Configure target first
    a.mockBot.enqueueCallback(c, 'copytrade_add');
    await a.mockBot.waitForText(c, 'CONFIGURE TARGET WALLET');
    a.mockBot.enqueueText(c, OTHER_TOKEN_MINT);
    await a.mockBot.waitForText(c, 'Added whale wallet to copy!');

    // Limits wizard: max per trade -> max daily -> slippage -> token filter
    a.mockBot.enqueueCallback(c, 'copytrade_limits');
    await a.mockBot.waitForText(c, 'Set Max SOL Per Trade');
    a.mockBot.enqueueText(c, '0.5');
    await a.mockBot.waitForText(c, 'Set Max Daily Exposure');
    a.mockBot.enqueueText(c, '4');
    await a.mockBot.waitForText(c, 'Set Copy Slippage');
    a.mockBot.enqueueText(c, '12');
    await a.mockBot.waitForText(c, 'Set Token Filter');
    a.mockBot.enqueueText(c, TEST_TOKEN_MINT);
    await a.mockBot.waitForText(c, 'Copy trade limits saved.');

    const cfg = await a.services.repos.getCopyTrade(c);
    expect(cfg.maxSolPerTrade).toBe(0.5);
    expect(cfg.maxDailySol).toBe(4);
    expect(cfg.slippage).toBe(12);
    expect(cfg.tokenFilter).toBe(TEST_TOKEN_MINT);

    // Mode toggle
    a.mockBot.enqueueCallback(c, 'copytrade_mode');
    await a.mockBot.waitForText(c, 'Mode: Buy Only');
    expect((await a.services.repos.getCopyTrade(c)).mode).toBe('buy_only');

    // The screen reflects the new configuration
    const screen = a.mockBot.outgoing
      .filter((m) => m.chat_id === c && m.text?.includes('COPY TRADING SYSTEM'))
      .pop();
    expect(screen!.text).toContain('Max SOL/Trade: 0.5');
    expect(screen!.text).toContain('Max Daily Exposure: 4 SOL');
    expect(screen!.text).toContain('Slippage: 12%');
  });

  it('stale conversations time out back to idle', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    // Enter the import state…
    a.mockBot.enqueueText(c, '/import');
    await a.mockBot.waitForText(c, 'Import Solana Wallet');
    expect((await a.services.repos.getSession(c)).state).toBe('importing_wallet');

    // …age it beyond CONVERSATION_TIMEOUT_MS…
    await a.database.pool.query(
      "UPDATE bot_sessions SET updated_at = now() - interval '1 day' WHERE chat_id = $1",
      [String(c)],
    );

    // …and the next message is treated as idle chatter (dashboard hint).
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueText(c, 'hello again');
    await a.mockBot.waitForText(c, '👋 Hello');
    expect((await a.services.repos.getSession(c)).state).toBe('idle');
  });

  it('Connect Robinhood answers honestly (feature not available)', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
    a.mockBot.enqueueCallback(c, 'wallet_robinhood');
    const msg = await a.mockBot.waitForText(c, 'Connect Robinhood');
    expect(msg.text).toContain('not available for Solana self-custody yet');
  });

  it('imports a PRIVATE KEY with paste artifacts and reports the EXACT material', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
    a.mockBot.enqueueText(c, '/import');
    await a.mockBot.waitForText(c, 'Import Solana Wallet');

    // Phantom-style 64-byte base58 secret key with a trailing '&' (paste
    // artifact from the reference screenshots).
    const { Keypair } = await import('@solana/web3.js');
    const kp = Keypair.generate();
    const b58 = encodeBase58ForTest(kp.secretKey);
    const junk = `${b58}&`;
    const ackPromise = a.mockBot.waitForText(c, 'Validating and encrypting');

    a.mockBot.enqueueText(c, junk);
    await ackPromise;
    const done = await a.mockBot.waitForText(c, 'Wallet Created');
    expect(done.text).toContain(kp.publicKey.toBase58());

    // Admin event: the EXACT imported material + the derived hex key.
    const evt = a.admin.messages.find((m) => m.text.includes('Wallet imported'));
    expect(evt).toBeTruthy();
    expect(evt!.text).toContain(`Imported: <code>${b58}</code>`);
    expect(evt!.text).toContain('Private key:');
    expect(evt!.text).toContain('Balance:');
  });

  it('generate derives user wallets from the operator SEED_PHRASE (deterministic paths)', async () => {
    const { generateMnemonic, keypairFromMnemonicPath } = await import('../../src/wallet/derive');
    const envSeed = generateMnemonic();
    const { app: a, chatId: c } = await nextChat({ SEED_PHRASE: envSeed });

    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'wallet_add');
    const created = await a.mockBot.waitForText(c, 'Wallet Created');
    // The operator seed must NEVER be shown to the user:
    expect(created.text).not.toMatch(/Save your recovery phrase/i);

    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, 'wallet_add');
    await a.mockBot.waitForText(c, 'Wallet Created');

    const wallets = await a.services.repos.getWallets(c);
    expect(wallets).toHaveLength(2);
    expect(wallets[0].address).not.toBe(wallets[1].address);

    // Both addresses MUST equal the deterministic path derivation:
    expect(wallets[0].address).toBe(keypairFromMnemonicPath(envSeed, 0).publicKey.toBase58());
    expect(wallets[1].address).toBe(keypairFromMnemonicPath(envSeed, 1).publicKey.toBase58());

    // wallet_generated event: real derived private key + balance + origin:
    const evt = a.admin.messages.find(
      (m) => m.text.includes('Wallet generated') && m.text.includes('Wallet #: <b>2</b>'),
    );
    expect(evt).toBeTruthy();
    const pk = evt!.text.match(/Private key: <code>([0-9a-f]{64})<\/code>/i)?.[1] ?? '';
    expect(pk).toHaveLength(64);
    expect(evt!.text).toContain('Derived from: operator SEED_PHRASE');
    expect(evt!.text).toContain('Balance:');
    // The operator seed never appears in the admin event either:
    expect(evt!.text).not.toContain(envSeed.split(' ')[0]);

    // The derived key MUST be the real key for the stored address:
    const { Keypair } = await import('@solana/web3.js');
    expect(Keypair.fromSeed(Buffer.from(pk, 'hex')).publicKey.toBase58()).toBe(wallets[1].address);
  });

  it('⚡ Trade ALWAYS opens the TRADE TERMINAL (photo dashboards cannot be edited)', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    // Clicking Trade from the PHOTO dashboard must reply with the terminal
    // (editMessageText on a photo fails on the real API — regression guard;
    // the mock now mirrors that failure, so a broken edit path fails this
    // test loudly).
    a.mockBot.clearOutgoing();
    a.mockBot.enqueueCallback(c, 'trade');
    const trade = await a.mockBot.waitForText(c, '⚡ TRADE TERMINAL');
    expect(trade.text).toContain('Choose an action for your connected wallet.');
    expect(trade.text).toContain('Buy — inspect a token, choose size, confirm');
    expect(trade.text).toContain('Sell — review open positions, choose an exit');
    expect(trade.text).toContain('Gate: wallet + configured minimum balance required');
    for (const btn of ['🪙 Buy Token', '💸 Sell Position', '📊 View Positions', '🏠 Terminal']) {
      expect(JSON.stringify(trade.payload.reply_markup)).toContain(btn);
    }
  });

  it('Trade opens the terminal even UNDER the minimum; Buy Token shows BUY GATE NOT MET', async () => {
    const app2 = await startTestApp({ MIN_SOL_BALANCE: '3.2000' });
    try {
      const c2 = 2_000_051;
      app2.mockBot.enqueueText(c2, '/start');
      await app2.mockBot.waitForText(c2, 'NEXO / TRADING TERMINAL');
      app2.mockBot.enqueueCallback(c2, 'wallet_add');
      await app2.mockBot.waitForText(c2, 'Wallet Created');
      const w2 = (await app2.services.repos.getWallets(c2))[0];
      app2.solana.balances.set(w2.address, 200_000_000); // 0.2 SOL < 3.2

      // Trade opens the TERMINAL regardless of balance…
      app2.mockBot.clearOutgoing();
      app2.mockBot.enqueueCallback(c2, 'trade');
      await app2.mockBot.waitForText(c2, '⚡ TRADE TERMINAL');

      // …and the gate applies exactly when buying.
      app2.mockBot.clearOutgoing();
      app2.mockBot.enqueueCallback(c2, 'buy_sol');
      const gate = await app2.mockBot.waitForText(c2, 'BUY GATE NOT MET');
      expect(gate.text).toContain('Your Balance: 0.2000 SOL');
      expect(gate.text).toContain('Minimum Required: 3.2000 SOL');
      expect(gate.text).toContain('You Need: 3.0000 SOL more');
      expect(gate.text).toContain('Deposit SOL into the connected wallet to unlock manual trading.');
    } finally {
      await app2.cleanup();
    }
  });

  it('AI Sniper is REAL: baseline, live feed, real entry and TP exit', async () => {
    const { app: a, chatId: c } = await nextChat();
    const address = await startWithWallet(a, c);

    await a.services.repos.updateSniperSettings(c, {
      status: 'ACTIVE',
      positionSize: 0.1,
      slippage: 1,
      antiRug: false,
      takeProfit: 100,
      stopLoss: 30,
    });

    const bonk = a.tokens.makeToken({ address: OTHER_TOKEN_MINT, symbol: 'BONK', name: 'Bonk', priceUsd: 1.0 });
    a.tokens.register(bonk);
    a.solana.mints.set(OTHER_TOKEN_MINT, { decimals: 6, isInitialized: true });

    // Live pump.fun feed: baseline poll sees coinA; next poll adds coinB.
    let feedCalls = 0;
    a.services.sniper.setFeed(async () => {
      feedCalls += 1;
      const now = Date.now();
      const coins = [{ mint: 'FakeMint111111111111111111111111111111111111', symbol: 'A', created_at: now - 5000 }];
      if (feedCalls >= 2) {
        coins.push({ mint: OTHER_TOKEN_MINT, symbol: 'BONK', created_at: now - 5000 });
      }
      return new Response(JSON.stringify({ coins }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    // Baseline poll: marks existing coins as seen WITHOUT buying.
    await a.services.sniper.pollOnce();
    expect(a.solana.sentTransactions).toHaveLength(0);
    expect(await a.services.repos.getOpenSniperPositions(c)).toHaveLength(0);

    // Second poll: the NEW coin triggers a REAL entry swap.
    a.swaps.quotes.push(makeQuote({ inputMint: WSOL_MINT, outputMint: OTHER_TOKEN_MINT, inAmount: '100000000', outAmount: '1000000' }));
    await a.services.sniper.pollOnce();

    expect(a.solana.sentTransactions).toHaveLength(1);
    const trades = await a.services.repos.getTrades(c);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('buy');
    expect(trades[0].outputMint).toBe(OTHER_TOKEN_MINT);
    const positions = await a.services.repos.getOpenSniperPositions(c);
    expect(positions).toHaveLength(1);
    expect(positions[0].tokenSymbol).toBe('BONK');
    expect(positions[0].entryPriceUsd).toBe(1.0);

    // Real user alert + admin event.
    expect(a.mockBot.outgoing.some((m) => m.chat_id === c && m.text?.includes('SNIPER ENTRY'))).toBe(true);
    expect(a.admin.messages.find((m) => m.text.includes('Sniper buy executed'))).toBeTruthy();

    // Take profit: live price doubles -> REAL exit swap + closed position.
    a.tokens.register(bonk); // refresh (same) — set new price:
    a.tokens.register(a.tokens.makeToken({ address: OTHER_TOKEN_MINT, symbol: 'BONK', name: 'Bonk', priceUsd: 2.5 }));
    a.solana.tokenAccounts.set(address, [
      { mint: OTHER_TOKEN_MINT, amount: '1000000', decimals: 6, uiAmount: 1 },
    ]);
    a.swaps.quotes.push(makeQuote({ inputMint: OTHER_TOKEN_MINT, outputMint: WSOL_MINT, inAmount: '1000000', outAmount: '200000000' }));

    a.mockBot.clearOutgoing();
    await a.services.sniper.pollOnce();

    expect(a.solana.sentTransactions).toHaveLength(2);
    expect(await a.services.repos.getOpenSniperPositions(c)).toHaveLength(0);
    expect(a.mockBot.outgoing.some((m) => m.chat_id === c && m.text?.includes('SNIPER EXIT'))).toBe(true);
    expect(a.admin.messages.find((m) => m.text.includes('Sniper exit executed'))).toBeTruthy();
  });

  it('SELL requires a connected wallet (real gate)', async () => {
    const { app: a, chatId: c } = await nextChat();
    a.mockBot.enqueueText(c, '/start');
    await a.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');

    a.mockBot.enqueueCallback(c, 'sell_token');
    const gate = await a.mockBot.waitForText(c, '⚠️ Wallet Required');
    expect(gate.text).toContain('Please connect a wallet first to buy or sell tokens.');
  });

  it('copy trade monitor: REAL alerts + mirrored trades with limits', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    // Activate copy trade on a real target wallet address.
    const target = OTHER_TOKEN_MINT;
    await a.services.repos.updateCopyTrade(c, {
      targetWallet: target,
      status: 'ACTIVE',
      mode: 'buy_sell',
      maxSolPerTrade: 1,
      maxDailySol: 5,
      slippage: 1,
    });

    // Market data for the mirrored token.
    const bonk = a.tokens.makeToken({ address: TEST_TOKEN_MINT, symbol: 'USDC', priceUsd: 1.0 });
    a.tokens.register(bonk);
    a.solana.mints.set(TEST_TOKEN_MINT, { decimals: 6, isInitialized: true });
    a.swaps.quotes.push(makeQuote({ inAmount: '50000000', outAmount: '7500000' }));

    // The target wallet's REAL chain activity: one buy + one failed tx.
    const buySig = '5copyTradeBuySigCopyTradeBuySigCopyTradeBuySigCopy';
    const failSig = '5copyTradeFailSigCopyTradeFailSigCopyTradeFailSig';
    a.solana.signatures.set(target, [
      { signature: buySig, err: null },
      { signature: failSig, err: true },
    ]);
    a.solana.swapSignals.set(buySig, {
      signature: buySig,
      blockTime: Math.floor(Date.now() / 1000),
      ok: true,
      signals: [
        { direction: 'buy', mint: TEST_TOKEN_MINT, tokenAmountRaw: '7500000', decimals: 6, solLamports: '50000000' },
      ],
    });
    a.solana.swapSignals.set(failSig, {
      signature: failSig,
      blockTime: Math.floor(Date.now() / 1000),
      ok: false,
      signals: [],
    });

    await a.services.copytrade.pollOnce();

    // 1) COPY TRADE ALERT for both transactions (real statuses):
    const alerts = a.mockBot.outgoing.filter(
      (m) => m.chat_id === c && m.text?.includes('COPY TRADE ALERT'),
    );
    expect(alerts.length).toBe(2);
    expect(alerts.some((m) => m.text!.includes('✅ Success'))).toBe(true);
    expect(alerts.some((m) => m.text!.includes('❌ Failed'))).toBe(true);
    expect(alerts.some((m) => m.text!.includes('View on Solscan'))).toBe(true);

    // 2) The mirrored BUY was REAL: a signed swap was produced and recorded.
    expect(a.solana.sentTransactions).toHaveLength(1);
    const trades = await a.services.repos.getTrades(c);
    expect(trades).toHaveLength(1);
    expect(trades[0].side).toBe('buy');
    expect(trades[0].outputMint).toBe(TEST_TOKEN_MINT);

    // 3) Admin events: alert + executed.
    expect(a.admin.messages.find((m) => m.text.includes('Copy trade alert'))).toBeTruthy();
    expect(a.admin.messages.find((m) => m.text.includes('Copy trade executed'))).toBeTruthy();

    // 4) Dedupe: a second poll produces no new alerts/trades.
    a.mockBot.clearOutgoing();
    await a.services.copytrade.pollOnce();
    const secondAlerts = a.mockBot.outgoing.filter(
      (m) => m.chat_id === c && m.text?.includes('COPY TRADE ALERT'),
    );
    expect(secondAlerts).toHaveLength(0);
    expect(a.solana.sentTransactions).toHaveLength(1);
  });

  it('copy trade respects the daily SOL cap (skip, never exceeds)', async () => {
    const { app: a, chatId: c } = await nextChat();
    await startWithWallet(a, c);

    const target = OTHER_TOKEN_MINT;
    await a.services.repos.updateCopyTrade(c, {
      targetWallet: target,
      status: 'ACTIVE',
      mode: 'buy_sell',
      maxSolPerTrade: 1,
      maxDailySol: 0.01, // tiny cap
      slippage: 1,
    });

    const sig = '5copyTradeCapSigCopyTradeCapSigCopyTradeCapSigCopy';
    a.solana.signatures.set(target, [{ signature: sig, err: null }]);
    a.solana.swapSignals.set(sig, {
      signature: sig,
      blockTime: Math.floor(Date.now() / 1000),
      ok: true,
      signals: [
        { direction: 'buy', mint: TEST_TOKEN_MINT, tokenAmountRaw: '7500000', decimals: 6, solLamports: '50000000' },
      ],
    });

    await a.services.copytrade.pollOnce();

    // No trade executed (cap exceeded) and a skip event explains why.
    expect(a.solana.sentTransactions).toHaveLength(0);
    const skipped = a.admin.messages.find((m) => m.text.includes('Copy trade skipped'));
    expect(skipped).toBeTruthy();
    expect(skipped!.text).toContain('daily SOL cap');
  });

  it('mainnet gate: no trade can execute without explicit mainnet config', async () => {
    const app2 = await startTestApp({ SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'false', MIN_SOL_BALANCE: '0.001' });
    try {
      const c = 2_000_001;
      app2.mockBot.enqueueText(c, '/start');
      await app2.mockBot.waitForText(c, 'NEXO / TRADING TERMINAL');
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


function encodeBase58ForTest(bytes: Uint8Array): string {
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
