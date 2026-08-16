/** Settings handlers: slippage, default buy amount, priority fee. */
import type { BotContext } from '../bot';
import { answerCallback, requirePrivate, resetToIdle, safeHandler, transition } from './common';
import {
  settingsMenuKeyboard,
  slippageKeyboard,
  buyAmountSettingsKeyboard,
  priorityFeeKeyboard,
  backToMenuKeyboard,
} from '../keyboards';
import { settingsText } from '../messages';
import { clampSlippageBps } from '../../trading/safety';

async function showSettings(ctx: BotContext): Promise<void> {
  const settings = await ctx.services.repos.getSettings(ctx.chat!.id);
  await ctx.reply(settingsText(settings.slippageBps, settings.buyAmountSol, settings.priorityFeeLamports), {
    parse_mode: 'HTML',
    reply_markup: settingsMenuKeyboard(),
  });
}

export const settingsShowHandler = safeHandler('settings.show', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await resetToIdle(ctx);
  await showSettings(ctx);
});

export const settingsSlippageMenuHandler = safeHandler('settings.slippage.menu', async (ctx) => {
  await answerCallback(ctx);
  await ctx.reply('🎚 <b>Slippage tolerance</b>\nHigher = trade succeeds more often, but with worse prices.', {
    parse_mode: 'HTML',
    reply_markup: slippageKeyboard(),
  });
});

export const settingsSlippageSetHandler = safeHandler('settings.slippage.set', async (ctx, bpsText: string) => {
  await answerCallback(ctx);
  const bps = clampSlippageBps(Number(bpsText));
  await ctx.services.repos.updateSettings(ctx.chat!.id, { slippageBps: bps });
  await showSettings(ctx);
});

export const settingsSlippageCustomPromptHandler = safeHandler('settings.slippage.custom', async (ctx) => {
  await answerCallback(ctx);
  await transition(ctx, 'awaiting_custom_slippage');
  await ctx.reply('Enter your slippage in percent (e.g. 1.5 for 1.5%):', { parse_mode: 'HTML' });
});

export const settingsSlippageCustomHandler = safeHandler('settings.slippage.custom.value', async (ctx) => {
  const text = ctx.message?.text?.trim().replace('%', '');
  if (!text) return;
  const pct = Number(text);
  if (!Number.isFinite(pct) || pct <= 0) {
    await ctx.reply('⚠️ Enter a positive number, e.g. 1.5:', { parse_mode: 'HTML' });
    return;
  }
  const bps = clampSlippageBps(Math.round(pct * 100));
  await ctx.services.repos.updateSettings(ctx.chat!.id, { slippageBps: bps });
  await resetToIdle(ctx);
  await showSettings(ctx);
});

export const settingsBuyAmountMenuHandler = safeHandler('settings.buyamount.menu', async (ctx) => {
  await answerCallback(ctx);
  await ctx.reply('💰 <b>Default buy amount</b>\nUsed to pre-fill the amount when buying.', {
    parse_mode: 'HTML',
    reply_markup: buyAmountSettingsKeyboard(),
  });
});

export const settingsBuyAmountSetHandler = safeHandler('settings.buyamount.set', async (ctx, sol: string) => {
  await answerCallback(ctx);
  const { solToLamports } = await import('../../util/format');
  solToLamports(sol); // validates format
  await ctx.services.repos.updateSettings(ctx.chat!.id, { buyAmountSol: sol });
  await showSettings(ctx);
});

export const settingsBuyAmountCustomPromptHandler = safeHandler('settings.buyamount.custom', async (ctx) => {
  await answerCallback(ctx);
  await transition(ctx, 'awaiting_custom_buy_amount');
  await ctx.reply('Enter the default buy amount in SOL (e.g. 0.25):', { parse_mode: 'HTML' });
});

export const settingsBuyAmountCustomHandler = safeHandler('settings.buyamount.custom.value', async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) return;
  try {
    const { solToLamports } = await import('../../util/format');
    solToLamports(text);
  } catch {
    await ctx.reply('⚠️ Invalid SOL amount. Try again:', { parse_mode: 'HTML' });
    return;
  }
  await ctx.services.repos.updateSettings(ctx.chat!.id, { buyAmountSol: text });
  await resetToIdle(ctx);
  await showSettings(ctx);
});

export const settingsPriorityFeeMenuHandler = safeHandler('settings.priofee.menu', async (ctx) => {
  await answerCallback(ctx);
  await ctx.reply('⛽ <b>Priority fee</b>\nExtra fee paid to validators for faster inclusion.', {
    parse_mode: 'HTML',
    reply_markup: priorityFeeKeyboard(),
  });
});

export const settingsPriorityFeeSetHandler = safeHandler('settings.priofee.set', async (ctx, lamportsText: string) => {
  await answerCallback(ctx);
  const lamports = Number(lamportsText);
  await ctx.services.repos.updateSettings(ctx.chat!.id, { priorityFeeLamports: lamports });
  await showSettings(ctx);
});

export { backToMenuKeyboard };
