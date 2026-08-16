/**
 * Portfolio / positions layer.
 *
 * Positions are derived from REAL on-chain token accounts + the trade
 * ledger; nothing is simulated. P/L uses the average-cost method:
 *   avgCost = SOL-in(buys) / tokens-bought
 *   realizedPnl = SOL-out(sells) - avgCost * tokens-sold
 *   unrealizedPnl = currentValue - avgCost * tokens-remaining
 * All P/L numbers are converted to USD using the live SOL price.
 */
import type { Logger } from '../logging/logger';
import type { Repos } from '../db/repos';
import type { SolanaClient } from '../solana/types';
import type { PriceProvider } from '../market/types';
import { WSOL_MINT, LAMPORTS_PER_SOL } from '../config/constants';
import { formatTokenAmount } from '../util/format';

export interface TokenPosition {
  mint: string;
  amount: string; // raw base units
  decimals: number;
  uiAmount: string;
  priceUsd: number | null;
  valueUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
  costBasisUsd: number | null;
}

export interface PortfolioSummary {
  chatId: number;
  address: string;
  solLamports: number;
  solPriceUsd: number | null;
  solUsd: number | null;
  tokens: TokenPosition[];
  totalUsd: number | null;
  totalUnrealizedUsd: number | null;
  totalRealizedUsd: number | null;
}

export class PortfolioService {
  constructor(
    private repos: Repos,
    private solana: SolanaClient,
    private prices: PriceProvider,
    private logger: Logger,
  ) {}

  async getSummary(chatId: number, address: string): Promise<PortfolioSummary> {
    const [solLamports, accounts, solPriceUsd] = await Promise.all([
      this.solana.getBalance(address),
      this.solana.getParsedTokenAccountsByOwner(address),
      this.prices.getSolPriceUsd().catch(() => null),
    ]);

    const held = accounts.filter((a) => BigInt(a.amount) > 0n);
    const priceMap = await this.prices
      .getPrices([WSOL_MINT, ...held.map((a) => a.mint)])
      .catch((err) => {
        this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'price fetch failed for portfolio');
        return {} as Record<string, number>;
      });

    const tokens: TokenPosition[] = [];
    let totalUsd: number | null = solPriceUsd ? (solLamports / LAMPORTS_PER_SOL) * solPriceUsd : null;
    let totalUnrealizedUsd = 0;
    let totalRealizedUsd = 0;

    for (const account of held) {
      const priceUsd = priceMap[account.mint] ?? null;
      const valueUsd = priceUsd !== null && account.uiAmount !== null
        ? account.uiAmount * priceUsd
        : null;
      if (valueUsd !== null) totalUsd = (totalUsd ?? 0) + valueUsd;

      const pnl = await this.pnlForMint(chatId, account.mint, account.amount, account.decimals, priceUsd, solPriceUsd);
      if (pnl.realizedUsd !== null) totalRealizedUsd += pnl.realizedUsd;
      if (pnl.unrealizedUsd !== null) totalUnrealizedUsd += pnl.unrealizedUsd;

      tokens.push({
        mint: account.mint,
        amount: account.amount,
        decimals: account.decimals,
        uiAmount: formatTokenAmount(account.amount, account.decimals),
        priceUsd,
        valueUsd,
        realizedPnlUsd: pnl.realizedUsd,
        unrealizedPnlUsd: pnl.unrealizedUsd,
        costBasisUsd: pnl.costBasisUsd,
      });
    }

    tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

    return {
      chatId,
      address,
      solLamports,
      solPriceUsd,
      solUsd: solPriceUsd ? (solLamports / LAMPORTS_PER_SOL) * solPriceUsd : null,
      tokens,
      totalUsd,
      totalUnrealizedUsd,
      totalRealizedUsd,
    };
  }

  private async pnlForMint(
    chatId: number,
    mint: string,
    currentRawAmount: string,
    decimals: number,
    priceUsd: number | null,
    solPriceUsd: number | null,
  ): Promise<{ realizedUsd: number | null; unrealizedUsd: number | null; costBasisUsd: number | null }> {
    const trades = await this.repos.getTradesForMint(chatId, mint);

    let boughtQty = 0;
    let boughtSol = 0; // lamports
    let soldQty = 0;
    let soldSol = 0; // lamports

    for (const t of trades) {
      if (t.side === 'buy' && t.outputMint === mint) {
        boughtQty += Number(t.outputAmount);
        boughtSol += Number(t.inputAmount);
      } else if (t.side === 'sell' && t.inputMint === mint) {
        soldQty += Number(t.inputAmount);
        soldSol += Number(t.outputAmount);
      }
    }

    if (boughtQty <= 0 || solPriceUsd === null) {
      return { realizedUsd: null, unrealizedUsd: null, costBasisUsd: null };
    }

    const avgCostSol = boughtSol / boughtQty; // SOL per raw unit
    const remainingQty = Math.max(0, boughtQty - soldQty);
    const costBasisSol = avgCostSol * remainingQty;
    const costBasisUsd = (costBasisSol / LAMPORTS_PER_SOL) * solPriceUsd;

    const realizedSol = soldSol - avgCostSol * soldQty;
    const realizedUsd = (realizedSol / LAMPORTS_PER_SOL) * solPriceUsd;

    const currentQty = Number(currentRawAmount);
    const unrealizedSol = priceUsd !== null
      ? (currentQty / 10 ** decimals) * priceUsd / solPriceUsd * LAMPORTS_PER_SOL - costBasisSol
      : null;
    const unrealizedUsd = unrealizedSol !== null ? (unrealizedSol / LAMPORTS_PER_SOL) * solPriceUsd : null;

    return { realizedUsd, unrealizedUsd, costBasisUsd };
  }
}
