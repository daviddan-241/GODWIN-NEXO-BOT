/**
 * Withdraw handlers: pick asset → destination → amount → confirm → real
 * on-chain transfer signed by the bot wallet.
 */
import { InlineKeyboard } from 'grammy';
import { PublicKey } from '@solana/web3.js';
import {
  answerCallback,
  networkLabel,
  requirePrivate,
  resetToIdle,
  safeHandler,
  transition,
} from './common';
import { confirmCancelKeyboard, backToMenuKeyboard } from '../keyboards';
import {
  formatTokenAmount,
  lamportsToSol,
  shortAddress,
  solToLamports,
  explorerTxUrl,
  escapeHtml,
} from '../../util/format';

export const withdrawStartHandler = safeHandler('withdraw.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await resetToIdle(ctx);

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) {
    await ctx.reply('Create a wallet first (👛 Wallet → Create).', { parse_mode: 'HTML' });
    return;
  }

  const accounts = await ctx.services.solana.getParsedTokenAccountsByOwner(wallet.address);
  const held = accounts.filter((a) => BigInt(a.amount) > 0n);

  const kb = new InlineKeyboard().text('◎ SOL', 'withdraw:pick:SOL');
  for (const a of held.slice(0, 6)) {
    kb.row().text(`${shortAddress(a.mint)} (${formatTokenAmount(a.amount, a.decimals)})`, `withdraw:pick:${a.mint}`);
  }
  kb.row().text('« Back to menu', 'menu:main');

  await ctx.reply('📤 <b>Withdraw</b>\nWhich asset?', { parse_mode: 'HTML', reply_markup: kb });
});

export const withdrawPickHandler = safeHandler('withdraw.pick', async (ctx, asset: string) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'awaiting_withdraw_address', { asset });
  const label = asset === 'SOL' ? 'SOL' : `token <code>${shortAddress(asset)}</code>`;
  await ctx.reply(
    `📤 Withdrawing ${label}.\n\nPaste the <b>destination wallet address</b>:`,
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
});

export const withdrawAddressHandler = safeHandler('withdraw.address', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  try {
    new PublicKey(text);
  } catch {
    await ctx.reply('⚠️ That is not a valid Solana address. Paste it again:', { parse_mode: 'HTML' });
    return;
  }

  await transition(ctx, 'awaiting_withdraw_amount', { ...ctx.session.payload, toAddress: text });
  const asset = ctx.session.payload.asset as string;
  const label = asset === 'SOL' ? 'SOL' : 'tokens';
  await ctx.reply(`How many ${label} do you want to send?`, { parse_mode: 'HTML' });
});

export const withdrawAmountHandler = safeHandler('withdraw.amount', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  const { asset, toAddress } = ctx.session.payload as { asset: string; toAddress: string };

  let amountUnits: bigint;
  let display: string;
  try {
    if (asset === 'SOL') {
      amountUnits = solToLamports(text);
      display = `${text} SOL`;
    } else {
      const decimals = (await ctx.services.solana.getMintInfo(asset)).decimals;
      if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Invalid amount');
      const [whole, frac = ''] = text.split('.');
      const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
      amountUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
      display = `${text} tokens`;
    }
  } catch (err) {
    await ctx.reply(`⚠️ Invalid amount. ${err instanceof Error ? err.message : ''}\nTry again:`, { parse_mode: 'HTML' });
    return;
  }

  if (amountUnits <= 0n) {
    await ctx.reply('⚠️ Amount must be greater than zero. Try again:', { parse_mode: 'HTML' });
    return;
  }

  await transition(ctx, 'awaiting_withdraw_confirm', {
    asset,
    toAddress,
    amountUnits: amountUnits.toString(),
  });

  await ctx.reply(
    `📤 <b>Confirm withdrawal</b>\n\nAsset: ${asset === 'SOL' ? 'SOL' : `<code>${shortAddress(asset)}</code>`}\nAmount: <b>${escapeHtml(display)}</b>\nTo: <code>${escapeHtml(toAddress)}</code>\n\nThis will broadcast a real on-chain transaction.`,
    { parse_mode: 'HTML', reply_markup: confirmCancelKeyboard('withdraw:confirm') },
  );
});

export const withdrawConfirmHandler = safeHandler('withdraw.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  const { asset, toAddress, amountUnits } = ctx.session.payload as {
    asset: string;
    toAddress: string;
    amountUnits: string;
  };

  const signature =
    asset === 'SOL'
      ? await ctx.services.wallets.withdrawSol(ctx.chat!.id, toAddress, BigInt(amountUnits))
      : await ctx.services.wallets.withdrawToken(ctx.chat!.id, asset, toAddress, BigInt(amountUnits));

  await resetToIdle(ctx);
  await ctx.reply(
    `✅ <b>Withdrawal sent</b> (${networkLabel(ctx)})\n\nTx: <code>${signature}</code>\n<a href="${explorerTxUrl(signature, ctx.services.config.isDevnet)}">View transaction ↗</a>`,
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
  const amountDisplay =
    asset === 'SOL'
      ? `${lamportsToSol(BigInt(amountUnits))} SOL`
      : `${amountUnits} base units of ${shortAddress(asset)}`;
  await ctx.services.notifier.send(
    `📤 <b>Withdrawal executed</b>\nUser: <code>${ctx.chat!.id}</code>\nAsset: ${asset === 'SOL' ? 'SOL' : asset}\nAmount: ${amountDisplay}\nTo: <code>${toAddress}</code>\nTx: <code>${signature}</code>`,
  );
});
