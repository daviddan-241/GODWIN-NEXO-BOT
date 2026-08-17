"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortfolioService = void 0;
const constants_1 = require("../config/constants");
const format_1 = require("../util/format");
class PortfolioService {
    repos;
    solana;
    prices;
    logger;
    constructor(repos, solana, prices, logger) {
        this.repos = repos;
        this.solana = solana;
        this.prices = prices;
        this.logger = logger;
    }
    async getSummary(chatId, address) {
        const [solLamports, accounts, solPriceUsd] = await Promise.all([
            this.solana.getBalance(address),
            this.solana.getParsedTokenAccountsByOwner(address),
            this.prices.getSolPriceUsd().catch(() => null),
        ]);
        const held = accounts.filter((a) => BigInt(a.amount) > 0n);
        const priceMap = await this.prices
            .getPrices([constants_1.WSOL_MINT, ...held.map((a) => a.mint)])
            .catch((err) => {
            this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'price fetch failed for portfolio');
            return {};
        });
        const tokens = [];
        let totalUsd = solPriceUsd ? (solLamports / constants_1.LAMPORTS_PER_SOL) * solPriceUsd : null;
        let totalUnrealizedUsd = 0;
        let totalRealizedUsd = 0;
        for (const account of held) {
            const priceUsd = priceMap[account.mint] ?? null;
            const valueUsd = priceUsd !== null && account.uiAmount !== null
                ? account.uiAmount * priceUsd
                : null;
            if (valueUsd !== null)
                totalUsd = (totalUsd ?? 0) + valueUsd;
            const pnl = await this.pnlForMint(chatId, account.mint, account.amount, account.decimals, priceUsd, solPriceUsd);
            if (pnl.realizedUsd !== null)
                totalRealizedUsd += pnl.realizedUsd;
            if (pnl.unrealizedUsd !== null)
                totalUnrealizedUsd += pnl.unrealizedUsd;
            tokens.push({
                mint: account.mint,
                amount: account.amount,
                decimals: account.decimals,
                uiAmount: (0, format_1.formatTokenAmount)(account.amount, account.decimals),
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
            solUsd: solPriceUsd ? (solLamports / constants_1.LAMPORTS_PER_SOL) * solPriceUsd : null,
            tokens,
            totalUsd,
            totalUnrealizedUsd,
            totalRealizedUsd,
        };
    }
    async pnlForMint(chatId, mint, currentRawAmount, decimals, priceUsd, solPriceUsd) {
        const trades = await this.repos.getTradesForMint(chatId, mint);
        let boughtQty = 0;
        let boughtSol = 0; // lamports
        let soldQty = 0;
        let soldSol = 0; // lamports
        for (const t of trades) {
            if (t.side === 'buy' && t.outputMint === mint) {
                boughtQty += Number(t.outputAmount);
                boughtSol += Number(t.inputAmount);
            }
            else if (t.side === 'sell' && t.inputMint === mint) {
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
        const costBasisUsd = (costBasisSol / constants_1.LAMPORTS_PER_SOL) * solPriceUsd;
        const realizedSol = soldSol - avgCostSol * soldQty;
        const realizedUsd = (realizedSol / constants_1.LAMPORTS_PER_SOL) * solPriceUsd;
        const currentQty = Number(currentRawAmount);
        const unrealizedSol = priceUsd !== null
            ? (currentQty / 10 ** decimals) * priceUsd / solPriceUsd * constants_1.LAMPORTS_PER_SOL - costBasisSol
            : null;
        const unrealizedUsd = unrealizedSol !== null ? (unrealizedSol / constants_1.LAMPORTS_PER_SOL) * solPriceUsd : null;
        return { realizedUsd, unrealizedUsd, costBasisUsd };
    }
}
exports.PortfolioService = PortfolioService;
//# sourceMappingURL=service.js.map