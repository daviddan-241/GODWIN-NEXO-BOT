/** Admin-only handlers: /stats and /broadcast. */
import type { BotContext } from '../bot';
import { safeHandler, resetToIdle } from './common';

function isAdmin(ctx: BotContext): boolean {
  const chatId = ctx.chat?.id;
  return chatId !== undefined && ctx.services.config.ADMIN_IDS.includes(chatId);
}

export const statsHandler = safeHandler('admin.stats', async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.', { parse_mode: 'HTML' });
    return;
  }
  const [users, tradesToday, depositsToday, wallets] = await Promise.all([
    ctx.services.repos.countUsers(),
    ctx.services.repos.countTradesToday(),
    ctx.services.repos.countDepositsToday(),
    ctx.services.repos.allWallets(),
  ]);

  await ctx.reply(
    `📊 <b>Bot stats</b>\n\nUsers: <b>${users}</b>\nWallets: <b>${wallets.length}</b>\nTrades (24h): <b>${tradesToday}</b>\nDeposits (24h): <b>${depositsToday}</b>\nNetwork: <b>${ctx.services.config.SOLANA_NETWORK}</b>\nMainnet enabled: <b>${ctx.services.config.tradingAllowed ? 'yes' : 'no'}</b>`,
    { parse_mode: 'HTML' },
  );
});

export const broadcastHandler = safeHandler('admin.broadcast', async (ctx, text: string) => {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Admin only.', { parse_mode: 'HTML' });
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
    await new Promise((r) => setTimeout(r, 50)); // gentle rate limiting
  }
  await ctx.reply(`📣 Broadcast finished: ${sent} sent, ${failed} failed.`, { parse_mode: 'HTML' });
});
