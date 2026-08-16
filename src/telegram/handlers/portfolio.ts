/** Portfolio handler: live balances, prices and P/L. */
import { answerCallback, networkLabel, requirePrivate, resetToIdle, safeHandler } from './common';
import { backToMenuKeyboard } from '../keyboards';
import { escapeHtml, formatUsd, lamportsToSol, shortAddress } from '../../util/format';

function signed(value: number | null, digits = 2): string {
  if (value === null) return 'n/a';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}

export const showPortfolioHandler = safeHandler('portfolio.show', async (ctx) => {
  if (!(await requirePrivate(ctx))) return;
  await answerCallback(ctx);
  await resetToIdle(ctx);

  const wallet = await ctx.services.wallets.getInfo(ctx.chat!.id);
  if (!wallet) {
    await ctx.reply('Create a wallet first (👛 Wallet → Create).', { parse_mode: 'HTML' });
    return;
  }

  const summary = await ctx.services.portfolio.getSummary(ctx.chat!.id, wallet.address);
  const lines: string[] = [];
  lines.push(`📊 <b>Portfolio</b> (${networkLabel(ctx)})`);
  lines.push('');
  lines.push(`◎ <b>SOL</b>: ${lamportsToSol(summary.solLamports)} (${formatUsd(summary.solUsd)})`);

  for (const t of summary.tokens) {
    const pnl = t.unrealizedPnlUsd !== null ? ` · P/L ${signed(t.unrealizedPnlUsd)}` : '';
    lines.push(`🪙 <code>${shortAddress(t.mint, 4, 4)}</code>: ${escapeHtml(t.uiAmount)} (${formatUsd(t.valueUsd)})${pnl}`);
  }

  if (summary.tokens.length === 0) lines.push('🪙 No tokens held.');
  lines.push('');
  lines.push(`<b>Total</b>: ${formatUsd(summary.totalUsd)}`);
  if (summary.totalUnrealizedUsd !== 0 || summary.totalRealizedUsd !== 0) {
    lines.push(`Unrealized: ${signed(summary.totalUnrealizedUsd)} · Realized: ${signed(summary.totalRealizedUsd)}`);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: backToMenuKeyboard() });
});
