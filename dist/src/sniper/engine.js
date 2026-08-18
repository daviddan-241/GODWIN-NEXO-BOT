"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SniperEngine = void 0;
exports.shouldSnipe = shouldSnipe;
exports.tpSlDecision = tpSlDecision;
const constants_1 = require("../config/constants");
const retry_1 = require("../util/retry");
/** Pure entry decision — unit-tested. */
function shouldSnipe(coin, antiRug, market, minAgeSec, nowMs) {
    const createdMs = coin.created_at ?? null;
    if (createdMs !== null) {
        const ageSec = (nowMs - createdMs) / 1000;
        if (antiRug && ageSec < minAgeSec) {
            return { ok: false, reason: `too young (${Math.round(ageSec)}s < ${minAgeSec}s) and anti-rug is ON` };
        }
    }
    if (antiRug && (!market || market.liquidity <= 0)) {
        return { ok: false, reason: 'anti-rug is ON and no real liquidity has formed yet' };
    }
    return { ok: true };
}
/** Pure mark-to-market decision — unit-tested. */
function tpSlDecision(entryPrice, currentPrice, takeProfitPct, stopLossPct) {
    if (entryPrice <= 0 || currentPrice <= 0)
        return { action: 'hold' };
    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
    if (pnlPct >= takeProfitPct)
        return { action: 'take_profit', pnlPct };
    if (pnlPct <= -stopLossPct)
        return { action: 'stop_loss', pnlPct };
    return { action: 'hold' };
}
class SniperEngine {
    config;
    repos;
    solana;
    trading;
    tokens;
    notifier;
    logger;
    fetchFn;
    timer = null;
    stopped = false;
    running = false;
    /** Wired to the bot API: sends sniper entry/exit alerts to the user. */
    onUserAlert = null;
    /** Test hook: replace the pump.fun feed fetcher. */
    setFeed(fn) {
        this.fetchFn = fn;
    }
    constructor(config, repos, solana, trading, tokens, notifier, logger, fetchFn = fetch) {
        this.config = config;
        this.repos = repos;
        this.solana = solana;
        this.trading = trading;
        this.tokens = tokens;
        this.notifier = notifier;
        this.logger = logger;
        this.fetchFn = fetchFn;
    }
    start() {
        if (this.timer)
            return;
        this.stopped = false;
        this.logger.info({ intervalMs: this.config.SNIPER_POLL_INTERVAL_MS }, 'sniper engine started');
        void this.loop();
    }
    stop() {
        this.stopped = true;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        this.logger.info('sniper engine stopped');
    }
    async loop() {
        while (!this.stopped) {
            try {
                await this.pollOnce();
            }
            catch (err) {
                this.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'sniper poll failed (will retry)');
            }
            await (0, retry_1.sleep)(this.config.SNIPER_POLL_INTERVAL_MS);
        }
    }
    async pollOnce() {
        if (this.running)
            return;
        this.running = true;
        try {
            const allUsers = await this.repos.allUserChatIds();
            for (const chatId of allUsers) {
                const settings = await this.repos.getSniperSettings(chatId);
                if (settings.status !== 'ACTIVE')
                    continue;
                try {
                    await this.scanNewTokens(chatId, settings);
                    await this.checkTpSl(chatId, settings);
                }
                catch (err) {
                    this.logger.warn({ chatId, err: err instanceof Error ? err.message : String(err) }, 'sniper cycle failed for user');
                }
            }
        }
        finally {
            this.running = false;
        }
    }
    // ------------------------------------------------------------------
    // Scanner
    // ------------------------------------------------------------------
    async fetchNewCoins() {
        let coins = await this.fetchPumpCoins();
        if (coins.length === 0) {
            // pump.fun unreachable (regional Cloudflare blocks happen): fall back
            // to DexScreener's latest token profiles — equally real new tokens.
            coins = await this.fetchDexLatest();
        }
        return coins;
    }
    async fetchPumpCoins() {
        try {
            const res = await this.fetchFn(`${this.config.PUMPFUN_API_URL}/coins?offset=0&limit=10&sort=created`, { signal: AbortSignal.timeout(8_000) });
            if (!res.ok)
                throw new Error(`pump.fun HTTP ${res.status}`);
            const data = (await res.json());
            return Array.isArray(data.coins) ? data.coins : [];
        }
        catch (err) {
            this.logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'pump.fun feed unavailable');
            return [];
        }
    }
    async fetchDexLatest() {
        try {
            const res = await this.fetchFn(`${this.config.DEXSCREENER_API_URL}/token-profiles/latest/v1`, { signal: AbortSignal.timeout(8_000) });
            if (!res.ok)
                throw new Error(`DexScreener latest HTTP ${res.status}`);
            const data = (await res.json());
            if (!Array.isArray(data))
                return [];
            return data
                .filter((p) => p.chainId === 'solana' && p.tokenAddress)
                .map((p) => ({ mint: p.tokenAddress }));
        }
        catch (err) {
            this.logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'dexscreener latest feed unavailable');
            return [];
        }
    }
    async scanNewTokens(chatId, settings) {
        const coins = await this.fetchNewCoins();
        if (coins.length === 0)
            return;
        const seenCount = await this.repos.countSniperSeen(chatId);
        const firstRun = seenCount === 0;
        for (const coin of coins) {
            const mint = coin.mint;
            if (!mint)
                continue;
            if (await this.repos.hasSniperSeen(chatId, mint))
                continue;
            // Mark seen FIRST so a crash mid-entry never double-buys.
            await this.repos.insertSniperSeen(chatId, mint);
            // First run = baseline only: never retro-buy existing listings.
            if (firstRun)
                continue;
            let market = null;
            let token = null;
            if (settings.antiRug) {
                token = await this.tokens.getTokenByAddress(mint).catch(() => null);
                market = token ? { liquidity: token.liquidity } : null;
            }
            const decision = shouldSnipe(coin, settings.antiRug, market, this.config.SNIPER_MIN_AGE_SEC, Date.now());
            if (!decision.ok) {
                this.logger.info({ chatId, mint, reason: decision.reason }, 'sniper skipped token');
                continue;
            }
            const tokenMeta = token ?? (await this.tokens.getTokenByAddress(mint).catch(() => null));
            const symbol = tokenMeta?.symbol ?? coin.symbol ?? mint.slice(0, 5).toUpperCase();
            const name = tokenMeta?.name ?? coin.name ?? 'New Token';
            const entryPrice = tokenMeta?.priceUsd ?? 0;
            try {
                const result = await this.trading.buy({
                    chatId,
                    tokenMint: mint,
                    amountInLamports: Math.round(settings.positionSize * constants_1.LAMPORTS_PER_SOL),
                    slippageBps: Math.round(settings.slippage * 100),
                });
                await this.repos.addPosition({
                    chatId,
                    tokenAddress: mint,
                    tokenSymbol: symbol,
                    tokenName: name,
                    amountSol: settings.positionSize,
                    entryPriceUsd: entryPrice,
                    sniper: true,
                });
                await this.onUserAlert?.(chatId, `🎯 <b>SNIPER ENTRY</b>\n\n${name} (${symbol})\n<code>${mint}</code>\n\nSize: ${settings.positionSize} SOL\nTx: <code>${result.signature}</code>\n<a href="https://solscan.io/tx/${result.signature}">🔗 View on Solscan</a>`);
                await this.notifier.event('sniper_buy_executed', {
                    user: chatId,
                    mint,
                    symbol,
                    sol: settings.positionSize,
                    signature: result.signature,
                });
                this.logger.info({ chatId, mint, signature: result.signature }, 'sniper entry confirmed (real swap)');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.warn({ chatId, mint, err: message }, 'sniper entry failed');
                await this.notifier.event('sniper_buy_failed', { user: chatId, mint, symbol, reason: message });
            }
        }
    }
    // ------------------------------------------------------------------
    // Take profit / stop loss
    // ------------------------------------------------------------------
    async checkTpSl(chatId, settings) {
        const positions = await this.repos.getOpenSniperPositions(chatId);
        for (const pos of positions) {
            let currentPrice = 0;
            const token = await this.tokens.getTokenByAddress(pos.tokenAddress).catch(() => null);
            if (token && token.priceUsd > 0)
                currentPrice = token.priceUsd;
            const decision = tpSlDecision(pos.entryPriceUsd, currentPrice, settings.takeProfit, settings.stopLoss);
            if (decision.action === 'hold')
                continue;
            // Real exit: sell whatever the wallet actually holds on-chain.
            const records = await this.repos.getActiveWallets(chatId);
            const wallet = records[0];
            if (!wallet)
                continue;
            const accounts = await this.solana.getParsedTokenAccountsByOwner(wallet.address);
            const account = accounts.find((a) => a.mint === pos.tokenAddress);
            if (!account || BigInt(account.amount) <= 0n) {
                // Nothing left to sell — close the position honestly.
                await this.repos.closePosition(chatId, pos.tokenAddress);
                continue;
            }
            try {
                const result = await this.trading.sell({
                    chatId,
                    tokenMint: pos.tokenAddress,
                    amountTokenUnits: BigInt(account.amount),
                    slippageBps: Math.round(settings.slippage * 100),
                    walletAddress: wallet.address,
                });
                await this.repos.closePosition(chatId, pos.tokenAddress);
                const label = decision.action === 'take_profit' ? `TAKE PROFIT +${decision.pnlPct.toFixed(1)}%` : `STOP LOSS −${Math.abs(decision.pnlPct).toFixed(1)}%`;
                await this.onUserAlert?.(chatId, `🎯 <b>SNIPER EXIT</b>\n\n${pos.tokenName} (${pos.tokenSymbol})\n${label}\n\nTx: <code>${result.signature}</code>\n<a href="https://solscan.io/tx/${result.signature}">🔗 View on Solscan</a>`);
                await this.notifier.event('sniper_sell_executed', {
                    user: chatId,
                    mint: pos.tokenAddress,
                    symbol: pos.tokenSymbol,
                    action: decision.action,
                    pnlPct: decision.pnlPct,
                    signature: result.signature,
                });
                this.logger.info({ chatId, mint: pos.tokenAddress, action: decision.action, signature: result.signature }, 'sniper exit confirmed (real swap)');
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.warn({ chatId, mint: pos.tokenAddress, err: message }, 'sniper exit failed');
                await this.notifier.event('sniper_sell_failed', {
                    user: chatId,
                    mint: pos.tokenAddress,
                    action: decision.action,
                    reason: message,
                });
            }
        }
    }
}
exports.SniperEngine = SniperEngine;
//# sourceMappingURL=engine.js.map