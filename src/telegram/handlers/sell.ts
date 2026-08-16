/**
 * Sell handlers: pick a held token → percentage → live quote preview →
 * confirm → real Jupiter swap back to SOL.
 */
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../bot';
import {
  answerCallback,
  networkLabel,
  requirePrivate,
  resetToIdle,
  safeHandler,
  transition,
} from './common';
import { confirmCancelKeyboard, sellPercentKeyboard, backToMenuKeyboard } from '../keyboards';
import { WSOL_MINT } from '../../config/constants';
import {
  bpsToPct,
  escapeHtml,
  explorerTxUrl,
  formatTokenAmount,
  lamportsToSol,
  shortAddress,
} from '../../util/format';

export const sellStartHandler = safeHandler('sell.start', async (ctx) => {
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

  if (held.length === 0) {
    await ctx.reply('You don\'t hold any tokens yet. Buy some first 🪙', {
      parse_mode: 'HTML',
      reply_markup: backToMenuKeyboard(),
    });
    return;
  }

  const kb = new InlineKeyboard();
  for (const a of held.slice(0, 12)) {
    kb.text(`${shortAddress(a.mint, 4, 4)} · ${formatTokenAmount(a.amount, a.decimals)}`, `sell:pick:${a.mint}`).row();
  }
  kb.text('« Back to menu', 'menu:main');

  await ctx.reply('💸 <b>Sell</b>\nPick a token you hold:', { parse_mode: 'HTML', reply_markup: kb });
});

export const sellPickHandler = safeHandler('sell.pick', async (ctx, mint: string) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'awaiting_sell_pct', { tokenMint: mint });
  await ctx.reply(
    `What percentage of <code>${mint}</code> do you want to sell?\n(type any number 1–100)`,
    { parse_mode: 'HTML', reply_markup: sellPercentKeyboard() },
  );
});

export const sellPctCallbackHandler = safeHandler('sell.pct.callback', async (ctx, pct: string) => {
  await answerCallback(ctx);
  await processSellPct(ctx, pct);
});

export const sellPctTextHandler = safeHandler('sell.pct.text', async (ctx) => {
  const text = ctx.message?.text?.trim()?.replace('%', '');
  if (!text) return;
  await processSellPct(ctx, text);
});

async function processSellPct(ctx: BotContext, pctText: string): Promise<void> {
  const pct = Number(pctText);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    await ctx.reply('⚠️ Enter a percentage between 1 and 100:', { parse_mode: 'HTML' });
    return;
  }

  const tokenMint = ctx.session.payload.tokenMint as string;
  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) throw new Error('No wallet found');

  // Re-read the live balance at confirm time to avoid stale amounts.
  const accounts = await ctx.services.solana.getParsedTokenAccountsByOwner(wallet.address);
  const account = accounts.find((a) => a.mint === tokenMint);
  if (!account || BigInt(account.amount) <= 0n) {
    await ctx.reply('You no longer hold this token.', { parse_mode: 'HTML' });
    await resetToIdle(ctx);
    return;
  }

  const total = BigInt(account.amount);
  const units = (total * BigInt(Math.floor(pct * 100))) / 10000n; // exact integer math
  if (units <= 0n) {
    await ctx.reply('Amount too small to sell.', { parse_mode: 'HTML' });
    return;
  }

  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);
  const quote = await ctx.services.swaps.getQuote({
    inputMint: tokenMint,
    outputMint: WSOL_MINT,
    amount: units.toString(),
    slippageBps: settings.slippageBps,
  });

  await transition(ctx, 'awaiting_sell_confirm', {
    tokenMint,
    amountUnits: units.toString(),
    slippageBps: settings.slippageBps,
  });

  const impactWarning = quote.priceImpactPct > 5
    ? `\n⚠️ <b>High price impact: ${quote.priceImpactPct.toFixed(2)}%</b>`
    : '';

  await ctx.reply(
    `💸 <b>Confirm sell</b> (${networkLabel(ctx)})\n\n` +
      `Sell: <b>${escapeHtml(formatTokenAmount(units.toString(), account.decimals))}</b> of <code>${tokenMint}</code>\n` +
      `Receive: <b>${lamportsToSol(BigInt(quote.outAmount))} SOL</b>\n` +
      `Slippage: ${bpsToPct(quote.slippageBps)}\n` +
      `Price impact: ${quote.priceImpactPct.toFixed(2)}%${impactWarning}\n\n` +
      `This broadcasts a real on-chain swap.`,
    { parse_mode: 'HTML', reply_markup: confirmCancelKeyboard('sell:confirm') },
  );
}

export const sellConfirmHandler = safeHandler('sell.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);

  const { tokenMint, amountUnits, slippageBps } = ctx.session.payload as {
    tokenMint: string;
    amountUnits: string;
    slippageBps: number;
  };

  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);
  const result = await ctx.services.trading.sell({
    chatId: ctx.chat!.id,
    tokenMint,
    amountTokenUnits: BigInt(amountUnits),
    slippageBps,
    priorityFeeLamports: settings.priorityFeeLamports || undefined,
  });

  await resetToIdle(ctx);
  await ctx.reply(
    `✅ <b>Sell executed</b> (${networkLabel(ctx)})\n\n` +
      `Sold: <b>${formatTokenAmount(result.inAmount, (await ctx.services.solana.getMintInfo(result.inputMint)).decimals)}</b>\n` +
      `Received: <b>${lamportsToSol(BigInt(result.outAmount))} SOL</b>\n` +
      `Tx: <code>${result.signature}</code>\n` +
      `<a href="${explorerTxUrl(result.signature, ctx.services.config.isDevnet)}">View transaction ↗</a>`,
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
  await ctx.services.notifier.send(
    `💸 <b>Sell executed</b>\nUser: <code>${ctx.chat!.id}</code>\nToken: <code>${shortAddress(tokenMint)}</code>\nOut: ${lamportsToSol(BigInt(result.outAmount))} SOL\nTx: <code>${result.signature}</code>`,
  );
});
