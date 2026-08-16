/** Buy handlers: token mint → SOL amount → live quote preview → confirm → real Jupiter swap signed by the bot wallet. */
import { PublicKey } from '@solana/web3.js';
import type { BotContext } from '../bot';
import {
  answerCallback,
  networkLabel,
  requirePrivate,
  resetToIdle,
  safeHandler,
  transition,
} from './common';
import { confirmCancelKeyboard, buyAmountKeyboard, backToMenuKeyboard } from '../keyboards';
import { WSOL_MINT } from '../../config/constants';
import {
  bpsToPct,
  escapeHtml,
  explorerTxUrl,
  formatTokenAmount,
  lamportsToSol,
  solToLamports,
} from '../../util/format';

export const buyStartHandler = safeHandler('buy.start', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await transition(ctx, 'awaiting_buy_token');
  await ctx.reply(
    '🪙 <b>Buy a token</b>\n\nPaste the token\'s <b>mint address</b> (from Jupiter, Birdeye, Dexscreener, etc.):',
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
});

export const buyTokenHandler = safeHandler('buy.token', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;

  let mint: string;
  try {
    mint = new PublicKey(text).toBase58();
  } catch {
    await ctx.reply('⚠️ That is not a valid mint address. Paste the token mint again:', { parse_mode: 'HTML' });
    return;
  }

  // Validate on-chain that this is a real mint, and fetch a live price.
  const [mintInfo, prices] = await Promise.all([
    ctx.services.solana.getMintInfo(mint),
    ctx.services.prices.getPrices([mint]).catch(() => ({}) as Record<string, number>),
  ]);

  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);
  await transition(ctx, 'awaiting_buy_amount', { tokenMint: mint });

  const priceText = prices[mint] !== undefined
    ? `\nPrice: <b>$${prices[mint].toFixed(6)}</b>`
    : '\nPrice: unavailable (token may have no liquid market)';

  await ctx.reply(
    `✅ Token verified on-chain (${mintInfo.decimals} decimals).\n<code>${mint}</code>${priceText}\n\nHow much SOL do you want to spend? (default: ${settings.buyAmountSol} SOL)`,
    { parse_mode: 'HTML', reply_markup: buyAmountKeyboard() },
  );
});

export const buyAmountCallbackHandler = safeHandler('buy.amount.callback', async (ctx, solAmount: string) => {
  await answerCallback(ctx);
  await processBuyAmount(ctx, solAmount);
});

export const buyAmountTextHandler = safeHandler('buy.amount.text', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  await processBuyAmount(ctx, text);
});

async function processBuyAmount(ctx: BotContext, solAmount: string): Promise<void> {
  let lamports: bigint;
  try {
    lamports = solToLamports(solAmount.replace(/[^\d.]/g, ''));
  } catch {
    await ctx.reply('⚠️ Invalid SOL amount. Enter a number like 0.1:', { parse_mode: 'HTML' });
    return;
  }

  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);
  const slippageBps = settings.slippageBps;
  const tokenMint = ctx.session.payload.tokenMint as string;

  // Live quote for the preview.
  const quote = await ctx.services.swaps.getQuote({
    inputMint: WSOL_MINT,
    outputMint: tokenMint,
    amount: lamports.toString(),
    slippageBps,
  });

  const mintInfo = await ctx.services.solana.getMintInfo(tokenMint);
  const outDisplay = formatTokenAmount(quote.outAmount, mintInfo.decimals);
  const impactWarning = quote.priceImpactPct > 5
    ? `\n⚠️ <b>High price impact: ${quote.priceImpactPct.toFixed(2)}%</b>`
    : '';

  await transition(ctx, 'awaiting_buy_confirm', {
    tokenMint,
    amountLamports: lamports.toString(),
    slippageBps,
  });

  await ctx.reply(
    `🪙 <b>Confirm buy</b> (${networkLabel(ctx)})\n\n` +
      `Spend: <b>${lamportsToSol(lamports)} SOL</b>\n` +
      `Receive: <b>${escapeHtml(outDisplay)}</b> of <code>${tokenMint}</code>\n` +
      `Slippage: ${bpsToPct(quote.slippageBps)}\n` +
      `Price impact: ${quote.priceImpactPct.toFixed(2)}%${impactWarning}\n\n` +
      `This broadcasts a real on-chain swap.`,
    { parse_mode: 'HTML', reply_markup: confirmCancelKeyboard('buy:confirm') },
  );
}

export const buyConfirmHandler = safeHandler('buy.confirm', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);

  const payload = ctx.session.payload as {
    tokenMint?: string;
    amountLamports?: string;
    slippageBps?: number;
  };
  if (!payload?.tokenMint || !payload?.amountLamports || !payload.slippageBps) {
    throw new Error('No pending buy order. Start a new buy first (🪙 Buy).');
  }
  const { tokenMint, amountLamports, slippageBps } = payload;

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) throw new Error('No wallet found. Create or import one first.');
  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);

  // buy_attempt admin event: user, wallet, token, amount, timestamp, result.
  let result: Awaited<ReturnType<typeof ctx.services.trading.buy>> | null = null;
  let failure: string | null = null;
  try {
    result = await ctx.services.trading.buy({
      chatId: ctx.chat!.id,
      tokenMint,
      amountInLamports: Number(amountLamports),
      slippageBps,
      priorityFeeLamports: settings.priorityFeeLamports || undefined,
    });
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  await ctx.services.notifier.event('buy_attempt', {
    user: ctx.chat!.id,
    wallet: wallet.address,
    token: tokenMint,
    amount: `${lamportsToSol(BigInt(amountLamports))} SOL`,
    result: failure ? `failed — ${failure}` : 'success',
  });
  if (failure) throw new Error(failure);

  await resetToIdle(ctx);
  await ctx.reply(
    `✅ <b>Buy executed</b> (${networkLabel(ctx)})\n\n` +
      `Spent: <b>${lamportsToSol(BigInt(result!.inAmount))} SOL</b>\n` +
      `Received: <b>${formatTokenAmount(result!.outAmount, (await ctx.services.solana.getMintInfo(result!.outputMint)).decimals)}</b>\n` +
      `Tx: <code>${result!.signature}</code>\n` +
      `<a href="${explorerTxUrl(result!.signature, ctx.services.config.isDevnet)}">View transaction ↗</a>`,
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
});
