"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputFile = void 0;
exports.createBot = createBot;
/**
 * Telegram bot layer: grammY wiring for the NEXO TRADING TERMINAL UI,
 * session middleware, command/callback routing and the dependency
 * container handed to handlers.
 */
const grammy_1 = require("grammy");
Object.defineProperty(exports, "InputFile", { enumerable: true, get: function () { return grammy_1.InputFile; } });
const rate_limit_1 = require("./rate-limit");
const nexo_1 = require("./handlers/nexo");
const nexo_2 = require("./handlers/nexo");
const common_1 = require("./handlers/common");
const session_1 = require("./session");
function createBot(services, token, apiRoot) {
    const bot = new grammy_1.Bot(token, apiRoot ? { client: { apiRoot } } : undefined);
    // ------------------------------------------------------------------
    // Hardening middleware: per-chat rate limiting + DB-backed session
    // load with conversation timeouts, then persist after handling.
    // ------------------------------------------------------------------
    const rateLimiter = new rate_limit_1.RateLimiter(services.config.RATE_LIMIT_MAX, services.config.RATE_LIMIT_WINDOW_MS);
    const ratePruner = setInterval(() => rateLimiter.prune(), 60_000);
    ratePruner.unref?.();
    bot.use(async (ctx, next) => {
        const chatId = ctx.chat?.id ?? ctx.update?.message?.chat?.id;
        if (chatId !== undefined && !rateLimiter.allow(chatId)) {
            services.logger.warn({ chatId }, 'update dropped by rate limiter');
            return; // drop abusive floods before any handler runs
        }
        if (chatId === undefined) {
            ctx.services = services;
            await next();
            return;
        }
        ctx.services = services;
        ctx.session = await services.sessions.get(chatId);
        // Conversation timeout: stale flows reset to idle.
        const age = Date.now() - new Date(ctx.session.updatedAt).getTime();
        if (ctx.session.state !== session_1.IDLE_STATE && age > services.config.CONVERSATION_TIMEOUT_MS) {
            ctx.session.state = session_1.IDLE_STATE;
            ctx.session.payload = {};
        }
        try {
            await next();
        }
        finally {
            try {
                await services.sessions.save(chatId, ctx.session);
            }
            catch (err) {
                services.logger.error({ chatId, err: err instanceof Error ? err.message : String(err) }, 'failed to persist session');
            }
        }
    });
    // ------------------------------------------------------------------
    // Global error handler.
    // ------------------------------------------------------------------
    bot.catch((err) => {
        const message = err.error instanceof Error ? err.error.message : String(err.error);
        services.logger.error({ err: message }, 'unhandled bot error');
        void services.notifier.notifyError('bot.catch', message);
    });
    // ------------------------------------------------------------------
    // Commands (matching the help screen).
    // ------------------------------------------------------------------
    bot.command('start', (ctx) => (0, nexo_2.startHandler)(ctx));
    bot.command('menu', (ctx) => (0, nexo_2.dashboardHandler)(ctx));
    bot.command('wallet', (ctx) => (0, nexo_2.walletHandler)(ctx));
    bot.command('generate', (ctx) => (0, nexo_2.generateWalletHandler)(ctx));
    bot.command('import', (ctx) => (0, nexo_2.walletImportPromptHandler)(ctx));
    bot.command('status', (ctx) => (0, nexo_2.walletStatusHandler)(ctx));
    bot.command('disconnect', (ctx) => (0, nexo_2.walletDisconnectHandler)(ctx));
    bot.command('help', (ctx) => (0, nexo_2.helpHandler)(ctx));
    bot.command('discover', (ctx) => (0, nexo_2.discoverHandler)(ctx));
    bot.command('cancel', (ctx) => (0, nexo_2.cancelHandler)(ctx));
    bot.command('stats', (ctx) => (0, nexo_2.statsHandler)(ctx));
    bot.command('broadcast', (ctx) => (0, nexo_2.broadcastHandler)(ctx, ctx.match.trim()));
    // ------------------------------------------------------------------
    // Callback queries (inline keyboard actions).
    // ------------------------------------------------------------------
    bot.callbackQuery('back_dashboard', (ctx) => (0, nexo_2.dashboardHandler)(ctx));
    bot.callbackQuery('refresh', (ctx) => (0, nexo_2.refreshHandler)(ctx));
    bot.callbackQuery('wallet', (ctx) => (0, nexo_2.walletHandler)(ctx));
    bot.callbackQuery('wallet_add', (ctx) => (0, nexo_2.generateWalletHandler)(ctx));
    bot.callbackQuery('wallet_import', (ctx) => (0, nexo_2.walletImportPromptHandler)(ctx));
    bot.callbackQuery('wallet_seed', (ctx) => (0, nexo_2.walletSeedPromptHandler)(ctx));
    bot.callbackQuery('wallet_status', (ctx) => (0, nexo_2.walletStatusHandler)(ctx));
    bot.callbackQuery('wallet_refresh', (ctx) => (0, nexo_2.walletRefreshHandler)(ctx));
    bot.callbackQuery('wallet_withdraw', (ctx) => (0, nexo_2.withdrawStartHandler)(ctx));
    bot.callbackQuery('wallet_disconnect', (ctx) => (0, nexo_2.walletDisconnectHandler)(ctx));
    bot.callbackQuery('wallet_robinhood', (ctx) => (0, nexo_2.walletRobinhoodHandler)(ctx));
    bot.callbackQuery('discover', (ctx) => (0, nexo_2.discoverHandler)(ctx));
    bot.callbackQuery('trade', (ctx) => (0, nexo_2.tradeHandler)(ctx));
    bot.callbackQuery('buy_sol', (ctx) => (0, nexo_2.tradeBuyStartHandler)(ctx));
    bot.callbackQuery('sell_token', (ctx) => (0, nexo_2.tradeSellStartHandler)(ctx));
    bot.callbackQuery('positions', (ctx) => (0, nexo_2.positionsHandler)(ctx));
    bot.callbackQuery('sniper', (ctx) => (0, nexo_2.sniperHandler)(ctx));
    bot.callbackQuery('sniper_activate', (ctx) => (0, nexo_2.sniperActivateHandler)(ctx));
    bot.callbackQuery('sniper_pause', (ctx) => (0, nexo_2.sniperPauseHandler)(ctx));
    bot.callbackQuery('sniper_buyamount', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_position_size')(ctx));
    bot.callbackQuery('sniper_devhold', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_dev_hold')(ctx));
    bot.callbackQuery('sniper_slippage', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_slippage')(ctx));
    bot.callbackQuery('sniper_priority', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_priority')(ctx));
    bot.callbackQuery('sniper_takeprofit', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_take_profit')(ctx));
    bot.callbackQuery('sniper_stoploss', (ctx) => (0, nexo_2.sniperSettingPromptHandler)('setting_stop_loss')(ctx));
    bot.callbackQuery('sniper_antirug', (ctx) => (0, nexo_2.sniperAntiRugHandler)(ctx));
    bot.callbackQuery('copytrade', (ctx) => (0, nexo_2.copyTradeHandler)(ctx));
    bot.callbackQuery('copytrade_start', (ctx) => (0, nexo_2.copyTradeStartHandler)(ctx));
    bot.callbackQuery('copytrade_add', (ctx) => (0, nexo_2.copyTradeConfigurePromptHandler)(ctx));
    bot.callbackQuery('copytrade_mode', (ctx) => (0, nexo_2.copyTradeModeHandler)(ctx));
    bot.callbackQuery('copytrade_limits', (ctx) => (0, nexo_2.copyTradeLimitsPromptHandler)(ctx));
    bot.callbackQuery(/^tw_(.+)$/, (ctx) => (0, nexo_2.tradeWalletPickHandler)(ctx, ctx.match[1]));
    bot.callbackQuery('help', (ctx) => (0, nexo_2.helpHandler)(ctx));
    bot.callbackQuery('cancel', (ctx) => (0, nexo_2.cancelHandler)(ctx));
    bot.callbackQuery('withdraw_confirm', (ctx) => (0, nexo_2.withdrawConfirmHandler)(ctx));
    bot.callbackQuery('confirm_buy', (ctx) => (0, nexo_2.buyConfirmHandler)(ctx));
    bot.callbackQuery(/^buy_(.+)$/, (ctx) => (0, nexo_2.buyFromSearchHandler)(ctx, ctx.match[1]));
    bot.callbackQuery(/^sell_(.+)$/, (ctx) => (0, nexo_2.sellFromSearchHandler)(ctx, ctx.match[1]));
    // ------------------------------------------------------------------
    // Free-text messages: routed by the current conversation state.
    // ------------------------------------------------------------------
    bot.on('message:text', async (ctx) => {
        if (ctx.chat.type !== 'private')
            return; // group chatter is ignored
        const state = ctx.session?.state ?? session_1.IDLE_STATE;
        switch (state) {
            case 'importing_wallet':
                return (0, nexo_2.walletImportHandleSecretHandler)(ctx);
            case 'withdrawing_address':
                return (0, nexo_2.withdrawAddressHandler)(ctx);
            case 'withdrawing_amount':
                return (0, nexo_2.withdrawAmountHandler)(ctx);
            case 'searching_token':
                return (0, nexo_2.searchTokenHandler)(ctx);
            case 'buying_token':
                return (0, nexo_2.buyFromTradeHandler)(ctx);
            case 'selling_token':
                return (0, nexo_2.sellFromTradeHandler)(ctx);
            case 'confirming_sell':
                return (0, nexo_2.sellAmountHandler)(ctx);
            case 'setting_position_size':
            case 'setting_dev_hold':
            case 'setting_slippage':
            case 'setting_priority':
            case 'setting_take_profit':
            case 'setting_stop_loss':
                return (0, nexo_2.sniperSettingValueHandler)(ctx);
            case 'copytrade_add':
                return (0, nexo_2.copyTradeAddHandler)(ctx);
            case 'copytrade_limits':
                return (0, nexo_2.copyTradeLimitsValueHandler)(ctx);
            default: {
                if (ctx.message.text.startsWith('/'))
                    return;
                await (0, common_1.resetToIdle)(ctx);
                await (0, nexo_1.dashboard)(ctx);
            }
        }
    });
    return bot;
}
//# sourceMappingURL=bot.js.map