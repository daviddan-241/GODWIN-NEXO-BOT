/** Deposit handler: address display + deposit history. */
import { answerCallback, networkLabel, requirePrivate, resetToIdle, safeHandler } from './common';
import { depositInfoText } from '../messages';
import { backToMenuKeyboard } from '../keyboards';
import { WSOL_MINT } from '../../config/constants';
import { formatTokenAmount, lamportsToSol } from '../../util/format';

export const showDepositHandler = safeHandler('deposit.show', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await resetToIdle(ctx);

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) {
    await ctx.reply('Create a wallet first (👛 Wallet → Create).', { parse_mode: 'HTML' });
    return;
  }

  let history = '';
  const deposits = await ctx.services.repos.getDeposits(ctx.chat!.id, 10);
  if (deposits.length > 0) {
    const lines: string[] = [];
    for (const d of deposits) {
      const label = d.mint === WSOL_MINT ? 'SOL' : `token ${d.mint.slice(0, 4)}…`;
      const amount = d.mint === WSOL_MINT
        ? `${lamportsToSol(d.amount)} SOL`
        : `${formatTokenAmount(d.amount, 9)} units`;
      lines.push(`• +${amount} (${label})`);
    }
    history = `\n\n<b>Recent deposits</b>\n${lines.join('\n')}`;
  }

  await ctx.reply(
    depositInfoText(wallet.address, networkLabel(ctx)) + history,
    { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() },
  );
});
