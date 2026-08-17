"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSOL_MINT = exports.CopyTradeMonitor = void 0;
const constants_1 = require("../config/constants");
Object.defineProperty(exports, "WSOL_MINT", { enumerable: true, get: function () { return constants_1.WSOL_MINT; } });
const format_1 = require("../util/format");
const retry_1 = require("../util/retry");
class CopyTradeMonitor {
    config;
    repos;
    solana;
    trading;
    notifier;
    logger;
    timer = null;
    stopped = false;
    running = false;
    /** Wired to the bot API: sends the COPY TRADE ALERT to the user. */
    onUserAlert = null;
    constructor(config, repos, solana, trading, notifier, logger) {
        this.config = config;
        this.repos = repos;
        this.solana = solana;
        this.trading = trading;
        this.notifier = notifier;
        this.logger = logger;
    }
    start() {
        if (this.timer)
            return;
        this.stopped = false;
        this.logger.info({ intervalMs: this.config.COPYTRADE_POLL_INTERVAL_MS }, 'copy trade monitor started');
        void this.loop();
    }
    stop() {
        this.stopped = true;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        this.logger.info('copy trade monitor stopped');
    }
    async loop() {
        while (!this.stopped) {
            try {
                await this.pollOnce();
            }
            catch (err) {
                this.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'copy trade poll failed (will retry)');
            }
            await (0, retry_1.sleep)(this.config.COPYTRADE_POLL_INTERVAL_MS);
        }
    }
    async pollOnce() {
        if (this.running)
            return;
        this.running = true;
        try {
            const configs = await this.repos.allActiveCopyTrades();
            for (const cfg of configs) {
                try {
                    await this.checkConfig(cfg);
                }
                catch (err) {
                    this.logger.warn({ chatId: cfg.chatId, err: err instanceof Error ? err.message : String(err) }, 'copy trade check failed for user');
                }
            }
        }
        finally {
            this.running = false;
        }
    }
    async checkConfig(cfg) {
        const chatId = cfg.chatId;
        if (!cfg.targetWallet)
            return;
        const signatures = await this.solana.getRecentSignatures(cfg.targetWallet, 10);
        for (const item of signatures) {
            if (await this.repos.hasCopytradeSignal(chatId, item.signature))
                continue;
            const parsed = await this.solana.getSwapSignals(item.signature);
            const status = parsed ? (parsed.ok ? 'Success' : 'Failed') : 'Unknown';
            await this.repos.insertCopytradeSignal(chatId, item.signature, status);
            // COPY TRADE ALERT (screenshot format) for EVERY target transaction.
            const timeText = parsed?.blockTime
                ? new Date(parsed.blockTime * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
                : new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            const statusIcon = status === 'Success' ? '✅' : status === 'Failed' ? '❌' : '⏳';
            const alert = `⚡ COPY TRADE ALERT\n\n` +
                `Target Wallet: <code>${(0, format_1.shortAddress)(cfg.targetWallet)}</code>\n` +
                `Transaction: <code>${(0, format_1.shortAddress)(item.signature)}</code>\n` +
                `Status: ${statusIcon} ${status}\n` +
                `Time: ${timeText}\n` +
                `<a href="https://solscan.io/tx/${item.signature}">🔗 View on Solscan</a>`;
            await this.onUserAlert?.(chatId, alert);
            await this.notifier.event('copy_trade_alert', {
                user: chatId,
                targetWallet: cfg.targetWallet,
                signature: item.signature,
                status,
            });
            // Mirror real trades for successful transactions with swap signals.
            if (!parsed || !parsed.ok || parsed.signals.length === 0)
                continue;
            for (const signal of parsed.signals) {
                await this.mirrorSignal(chatId, cfg, signal);
            }
        }
    }
    async mirrorSignal(chatId, cfg, signal) {
        // Mode + filter constraints.
        if (signal.direction === 'sell' && cfg.mode === 'buy_only') {
            await this.notifier.event('copy_trade_skipped', {
                user: chatId,
                signature: undefined,
                reason: 'sell skipped (Buy Only mode)',
                mint: signal.mint,
            });
            return;
        }
        if (cfg.tokenFilter && cfg.tokenFilter !== signal.mint) {
            await this.notifier.event('copy_trade_skipped', {
                user: chatId,
                reason: 'token filter mismatch',
                mint: signal.mint,
            });
            return;
        }
        // Daily exposure cap (real SOL accounting, reset per UTC day).
        const today = new Date().toISOString().slice(0, 10);
        const current = await this.repos.getCopyTrade(chatId);
        if (current.dailyResetDate !== today) {
            await this.repos.updateCopyTrade(chatId, { dailyUsedSol: 0, dailyResetDate: today });
        }
        const used = current.dailyResetDate === today ? current.dailyUsedSol : 0;
        const slippageBps = Math.round(cfg.slippage * 100);
        try {
            if (signal.direction === 'buy') {
                const targetSol = Number(signal.solLamports || '0') / constants_1.LAMPORTS_PER_SOL;
                const solToUse = Math.min(targetSol > 0 ? targetSol : cfg.maxSolPerTrade, cfg.maxSolPerTrade);
                if (solToUse < 0.001) {
                    await this.notifier.event('copy_trade_skipped', { user: chatId, reason: 'buy too small', mint: signal.mint });
                    return;
                }
                if (used + solToUse > cfg.maxDailySol) {
                    await this.notifier.event('copy_trade_skipped', {
                        user: chatId,
                        reason: `daily SOL cap reached (${used.toFixed(4)}/${cfg.maxDailySol})`,
                        mint: signal.mint,
                    });
                    return;
                }
                const result = await this.trading.buy({
                    chatId,
                    tokenMint: signal.mint,
                    amountInLamports: Math.round(solToUse * constants_1.LAMPORTS_PER_SOL),
                    slippageBps,
                });
                await this.repos.updateCopyTrade(chatId, { dailyUsedSol: used + solToUse });
                await this.onUserAlert?.(chatId, `🤖 <b>COPY TRADE EXECUTED</b> (mirror buy)\nToken: <code>${(0, format_1.shortAddress)(signal.mint)}</code>\nSpent: ${(0, format_1.lamportsToSol)(BigInt(result.inAmount))} SOL\nTx: <code>${result.signature}</code>`);
                await this.notifier.event('copy_trade_executed', {
                    user: chatId,
                    direction: 'buy',
                    mint: signal.mint,
                    sol: solToUse,
                    signature: result.signature,
                });
                this.logger.info({ chatId, mint: signal.mint, sol: solToUse, signature: result.signature }, 'copy trade mirror buy confirmed');
            }
            else {
                // Mirror sell: sell the SAME token amount the target sold (capped
                // by what the user actually holds — the executor verifies on-chain).
                const amountUnits = BigInt(signal.tokenAmountRaw);
                if (amountUnits <= 0n)
                    return;
                const result = await this.trading.sell({
                    chatId,
                    tokenMint: signal.mint,
                    amountTokenUnits: amountUnits,
                    slippageBps,
                });
                await this.onUserAlert?.(chatId, `🤖 <b>COPY TRADE EXECUTED</b> (mirror sell)\nToken: <code>${(0, format_1.shortAddress)(signal.mint)}</code>\nSold: ${(0, format_1.formatTokenAmount)(signal.tokenAmountRaw, signal.decimals)}\nTx: <code>${result.signature}</code>`);
                await this.notifier.event('copy_trade_executed', {
                    user: chatId,
                    direction: 'sell',
                    mint: signal.mint,
                    signature: result.signature,
                });
                this.logger.info({ chatId, mint: signal.mint, signature: result.signature }, 'copy trade mirror sell confirmed');
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn({ chatId, err: message, mint: signal.mint }, 'copy trade mirror failed');
            await this.notifier.event('copy_trade_failed', {
                user: chatId,
                mint: signal.mint,
                reason: message,
            });
        }
    }
}
exports.CopyTradeMonitor = CopyTradeMonitor;
//# sourceMappingURL=monitor.js.map