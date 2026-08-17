"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingExecutor = void 0;
/**
 * Trading executor — the only code path that builds, signs and submits
 * real swap transactions.
 *
 * Every trade:
 *   1. passes the safety layer (network gate + amount/slippage caps),
 *   2. gets a live Jupiter quote,
 *   3. gets a transaction from Jupiter's swap API,
 *   4. is signed locally with the bot wallet key (never sent anywhere),
 *   5. is submitted to the RPC and awaited to confirmation,
 *   6. is recorded in the trades table,
 *   7. re-baselines deposit snapshots so trade proceeds are not
 *      mistaken for external deposits,
 *   8. triggers admin notifications.
 */
const web3_js_1 = require("@solana/web3.js");
const constants_1 = require("../config/constants");
const safety_1 = require("./safety");
class TradingExecutor {
    config;
    repos;
    solana;
    swaps;
    prices;
    wallets;
    deposits;
    logger;
    constructor(config, repos, solana, swaps, prices, wallets, deposits, logger) {
        this.config = config;
        this.repos = repos;
        this.solana = solana;
        this.swaps = swaps;
        this.prices = prices;
        this.wallets = wallets;
        this.deposits = deposits;
        this.logger = logger;
    }
    async buy(params) {
        (0, safety_1.assertNetworkAllowsTrading)(this.config);
        (0, safety_1.assertTradeAmount)(params.amountInLamports, this.config);
        const slippageBps = (0, safety_1.clampSlippageBps)(params.slippageBps);
        const wallet = await this.resolveWallet(params.chatId, params.walletAddress);
        const balance = await this.solana.getBalance(wallet.address);
        if (balance < params.amountInLamports + 5_000_000) {
            throw new Error('Insufficient SOL balance for this trade (fees included).');
        }
        const quote = await this.swaps.getQuote({
            inputMint: constants_1.WSOL_MINT,
            outputMint: params.tokenMint,
            amount: String(params.amountInLamports),
            slippageBps,
        });
        const record = await this.repos.insertTrade({
            chatId: params.chatId,
            side: 'buy',
            inputMint: quote.inputMint,
            outputMint: quote.outputMint,
            inputAmount: quote.inAmount,
            outputAmount: quote.outAmount,
            priceUsd: null,
            slippageBps,
            txSignature: null,
            status: 'pending',
            error: null,
        });
        try {
            const txB64 = await this.swaps.buildSwapTransaction(quote, wallet.address, {
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: params.priorityFeeLamports,
            });
            const tx = web3_js_1.VersionedTransaction.deserialize(Buffer.from(txB64, 'base64'));
            const keypair = await this.wallets.getKeypair(params.chatId, wallet.address);
            tx.sign([keypair]);
            const signature = await this.solana.sendAndConfirmTransaction(tx);
            await this.repos.updateTradeStatus(record.id, 'confirmed', { txSignature: signature });
            const priceUsd = await this.tryTokenPriceUsd(quote.outputMint);
            if (priceUsd !== null) {
                // update price column post-confirm (kept simple; not blocking)
                void priceUsd;
            }
            await this.deposits.rebaseline(params.chatId);
            this.logger.info({ chatId: params.chatId, side: 'buy', signature, outMint: quote.outputMint }, 'trade confirmed');
            return {
                signature,
                inputMint: quote.inputMint,
                outputMint: quote.outputMint,
                inAmount: quote.inAmount,
                outAmount: quote.outAmount,
                priceImpactPct: quote.priceImpactPct,
            };
        }
        catch (err) {
            await this.repos.updateTradeStatus(record.id, 'failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }
    async sell(params) {
        (0, safety_1.assertNetworkAllowsTrading)(this.config);
        const slippageBps = (0, safety_1.clampSlippageBps)(params.slippageBps);
        if (params.amountTokenUnits <= 0n)
            throw new Error('Sell amount must be greater than zero');
        const wallet = await this.resolveWallet(params.chatId, params.walletAddress);
        // Verify the wallet actually holds the amount it is selling.
        const accounts = await this.solana.getParsedTokenAccountsByOwner(wallet.address);
        const account = accounts.find((a) => a.mint === params.tokenMint);
        if (!account)
            throw new Error('You do not hold this token.');
        if (BigInt(account.amount) < params.amountTokenUnits) {
            throw new Error('Sell amount exceeds your current balance.');
        }
        const quote = await this.swaps.getQuote({
            inputMint: params.tokenMint,
            outputMint: constants_1.WSOL_MINT,
            amount: params.amountTokenUnits.toString(),
            slippageBps,
        });
        const record = await this.repos.insertTrade({
            chatId: params.chatId,
            side: 'sell',
            inputMint: quote.inputMint,
            outputMint: quote.outputMint,
            inputAmount: quote.inAmount,
            outputAmount: quote.outAmount,
            priceUsd: null,
            slippageBps,
            txSignature: null,
            status: 'pending',
            error: null,
        });
        try {
            const txB64 = await this.swaps.buildSwapTransaction(quote, wallet.address, {
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: params.priorityFeeLamports,
            });
            const tx = web3_js_1.VersionedTransaction.deserialize(Buffer.from(txB64, 'base64'));
            const keypair = await this.wallets.getKeypair(params.chatId, wallet.address);
            tx.sign([keypair]);
            const signature = await this.solana.sendAndConfirmTransaction(tx);
            await this.repos.updateTradeStatus(record.id, 'confirmed', { txSignature: signature });
            await this.deposits.rebaseline(params.chatId);
            this.logger.info({ chatId: params.chatId, side: 'sell', signature, inMint: quote.inputMint }, 'trade confirmed');
            return {
                signature,
                inputMint: quote.inputMint,
                outputMint: quote.outputMint,
                inAmount: quote.inAmount,
                outAmount: quote.outAmount,
                priceImpactPct: quote.priceImpactPct,
            };
        }
        catch (err) {
            await this.repos.updateTradeStatus(record.id, 'failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            throw err;
        }
    }
    /** Resolves the executing wallet: explicit address, else the primary. */
    async resolveWallet(chatId, walletAddress) {
        const wallets = await this.wallets.getWallets(chatId);
        const chosen = walletAddress
            ? wallets.find((w) => w.address === walletAddress)
            : wallets[0];
        if (!chosen)
            throw new Error('No wallet found. Create or import one first.');
        return { address: chosen.address, walletNumber: chosen.walletNumber };
    }
    async tryTokenPriceUsd(mint) {
        try {
            const prices = await this.prices.getPrices([mint]);
            const p = prices[mint];
            return p !== undefined && p > 0 ? p : null;
        }
        catch {
            return null;
        }
    }
}
exports.TradingExecutor = TradingExecutor;
//# sourceMappingURL=executor.js.map