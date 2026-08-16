/**
 * Start / menu / help / cancel handlers.
 */
import { resetToIdle, safeHandler } from './common';
import { WELCOME_TEXT, HELP_TEXT, CANCELLED_TEXT } from '../messages';
import { mainMenuKeyboard } from '../keyboards';

export const startHandler = safeHandler('start', async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('Hfive works in private chats. Open a chat with the bot to trade.', { parse_mode: 'HTML' });
    return;
  }
  const user = ctx.from;
  await ctx.services.repos.upsertUser({
    chatId: ctx.chat.id,
    username: user?.username ?? null,
    firstName: user?.first_name ?? null,
  });
  await resetToIdle(ctx);
  await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
  ctx.services.logger.info({ chatId: ctx.chat.id }, 'user started bot');
});

export const menuHandler = safeHandler('menu', async (ctx) => {
  await resetToIdle(ctx);
  await ctx.reply('🏠 <b>Main menu</b>', { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
});

export const helpHandler = safeHandler('help', async (ctx) => {
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
});

export const cancelHandler = safeHandler('cancel', async (ctx) => {
  await resetToIdle(ctx);
  await ctx.reply(CANCELLED_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
});
