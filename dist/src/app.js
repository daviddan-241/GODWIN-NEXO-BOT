"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabase = void 0;
exports.createApp = createApp;
/**
 * Application assembly: builds every real production dependency and wires
 * them together. Tests reuse the same `createBot` with injected doubles.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const client_1 = require("./db/client");
Object.defineProperty(exports, "createDatabase", { enumerable: true, get: function () { return client_1.createDatabase; } });
const migrate_1 = require("./db/migrate");
const repos_1 = require("./db/repos");
const client_2 = require("./solana/client");
const jupiter_1 = require("./market/jupiter");
const coingecko_1 = require("./market/coingecko");
const token_resolver_1 = require("./market/token-resolver");
const ws_watcher_1 = require("./solana/ws-watcher");
const derive_1 = require("./wallet/derive");
const service_1 = require("./wallet/service");
const executor_1 = require("./trading/executor");
const service_2 = require("./portfolio/service");
const monitor_1 = require("./deposits/monitor");
const monitor_2 = require("./copytrade/monitor");
const engine_1 = require("./sniper/engine");
const transport_1 = require("./admin/transport");
const notifier_1 = require("./admin/notifier");
const session_1 = require("./telegram/session");
const bot_1 = require("./telegram/bot");
const grammy_1 = require("grammy");
const logo_1 = require("./telegram/logo");
const server_1 = require("./health/server");
const constants_1 = require("./config/constants");
const messages_1 = require("./telegram/messages");
function createApp(config, logger, database) {
    const repos = new repos_1.Repos(database.db);
    const solana = new client_2.ConnectionSolanaClient({
        rpcUrl: config.rpcUrl,
        commitment: config.COMMITMENT,
    });
    const prices = new jupiter_1.JupiterPriceProvider(config.JUPITER_PRICE_API_URL, logger);
    const swaps = new jupiter_1.JupiterSwapProvider(config.JUPITER_QUOTE_API_URL, logger);
    const market = new coingecko_1.CoinGeckoMarket(config.COINGECKO_API_URL, logger, fetch, config.JUPITER_PRICE_API_URL);
    const tokens = new token_resolver_1.MultiProviderTokenResolver({
        coingeckoUrl: config.COINGECKO_API_URL,
        dexscreenerUrl: config.DEXSCREENER_API_URL,
        raydiumPriceUrl: `${config.RAYDIUM_API_URL}/mint/price`,
        birdeyeUrl: config.BIRDEYE_API_URL,
        jupiterTokenListUrl: config.JUPITER_TOKEN_LIST_URL,
        pumpfunUrl: config.PUMPFUN_API_URL,
    }, logger);
    const transport = new transport_1.TelegramAdminTransport(config);
    const notifier = new notifier_1.AdminNotifier(transport, config.ADMIN_IDS, logger, true, 
    // Durable admin event log (PostgreSQL).
    { record: (type, traceId, payload) => repos.insertAdminEvent(type, traceId, payload) });
    const wallets = new service_1.WalletService(repos, solana, config, logger);
    const sessions = new session_1.DbSessionStore(repos);
    const deposits = new monitor_1.DepositMonitor(config, repos, solana, notifier, logger);
    const trading = new executor_1.TradingExecutor(config, repos, solana, swaps, prices, wallets, deposits, logger);
    const copytrade = new monitor_2.CopyTradeMonitor(config, repos, solana, trading, notifier, logger);
    const sniper = new engine_1.SniperEngine(config, repos, solana, trading, tokens, notifier, logger);
    const portfolio = new service_2.PortfolioService(repos, solana, prices, logger);
    const services = {
        config,
        logger,
        repos,
        solana,
        prices,
        swaps,
        market,
        tokens,
        wallets,
        trading,
        portfolio,
        deposits,
        copytrade,
        sniper,
        notifier,
        sessions,
        sendToUser: async () => {
            throw new Error('sendToUser not wired yet');
        },
        sendTerminal: async (ctx, caption, keyboard) => {
            const logo = (0, logo_1.resolveLogoPath)();
            if (node_fs_1.default.existsSync(logo)) {
                await ctx
                    .replyWithPhoto(new grammy_1.InputFile(logo), {
                    caption,
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                })
                    .catch(async (err) => {
                    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'logo send failed; falling back to text');
                    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
                });
            }
            else {
                await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
            }
        },
    };
    const bot = (0, bot_1.createBot)(services, config.BOT_TOKEN, config.telegramApiRoot);
    // Wire the broadcast/deposit paths to the real Bot API client.
    services.sendToUser = (chatId, text) => bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    // USER deposit notification (DEPOSIT RECEIVED) via the real Bot API.
    deposits.onUserDeposit = (chatId, address, amountSol, newBalanceSol, signature) => services.sendToUser(chatId, (0, messages_1.depositReceivedMessage)(address, amountSol, newBalanceSol, signature)).then(() => undefined);
    // USER copy-trade alerts via the real Bot API.
    copytrade.onUserAlert = (chatId, text) => services.sendToUser(chatId, text).then(() => undefined);
    // USER sniper entry/exit alerts via the real Bot API.
    sniper.onUserAlert = (chatId, text) => services.sendToUser(chatId, text).then(() => undefined);
    // Bot readiness is established once at startup (getMe above); the health
    // endpoint reports the cached result instead of re-calling the Bot API on
    // every poll.
    let botVerified = false;
    // Optional WebSocket watcher lifecycle (owned by the app).
    let watcher = null;
    let watcherTimer = null;
    const health = (0, server_1.createHealthServer)({
        database: () => (0, client_1.pingDatabase)(database),
        rpc: () => solana.getHealth(),
        bot: async () => {
            if (!botVerified) {
                await bot.api.getMe();
                botVerified = true;
            }
            return true;
        },
    }, logger);
    return {
        services,
        bot,
        database,
        async start() {
            // 1. Database connectivity + migrations (idempotent).
            await (0, client_1.pingDatabase)(database);
            const applied = await (0, migrate_1.runMigrations)(database.pool);
            if (applied.length > 0) {
                logger.info({ applied }, 'database migrations applied');
            }
            else {
                logger.info('database schema up to date');
            }
            // 2. Verify Telegram credentials before serving users.
            const me = await bot.api.getMe();
            botVerified = true;
            logger.info({
                botUsername: me.username,
                network: config.SOLANA_NETWORK,
                tradingAllowed: config.tradingAllowed,
                rpcUrl: config.rpcUrl,
                appName: constants_1.APP_NAME,
                version: constants_1.APP_VERSION,
            }, 'Telegram bot verified');
            await bot.api
                .setMyCommands([
                { command: 'start', description: 'Open trading terminal' },
                { command: 'wallet', description: 'Manage portfolio' },
                { command: 'status', description: 'Check wallet status' },
                { command: 'generate', description: 'Connect SOL wallet' },
                { command: 'import', description: 'Import wallet' },
                { command: 'disconnect', description: 'Disconnect wallet' },
                { command: 'help', description: 'Open control center' },
            ])
                .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'setMyCommands failed (non-fatal)'));
            // 3. Health server (UptimeRobot: GET / or /health -> "OK").
            if (config.HEALTHCHECK_ENABLED) {
                health.listen(config.PORT, '0.0.0.0', () => {
                    logger.info({ port: config.PORT }, 'health server listening on 0.0.0.0');
                });
            }
            else {
                logger.info('health server disabled (HEALTHCHECK_ENABLED=false)');
            }
            // 4. Optional owner seed phrase: derive the owner wallet at startup,
            //    verify it against the REAL chain (balance check), and notify
            //    admins with the public address + real balance. The seed itself
            //    is never logged or stored.
            if (config.SEED_PHRASE) {
                try {
                    const owner = (0, derive_1.keypairFromMnemonic)(config.SEED_PHRASE);
                    const ownerAddress = owner.publicKey.toBase58();
                    let ownerBalance = 0;
                    try {
                        ownerBalance = await solana.getBalance(ownerAddress);
                    }
                    catch (err) {
                        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'owner balance check failed (non-fatal)');
                    }
                    logger.info({ ownerAddress }, 'owner seed phrase configured');
                    await notifier.event('owner_wallet', {
                        address: ownerAddress,
                        balanceSol: (ownerBalance / 1e9).toFixed(6),
                    });
                }
                catch (err) {
                    throw new Error(`SEED_PHRASE is not a valid BIP39 mnemonic: ${err instanceof Error ? err.message : err}`);
                }
            }
            // 5. Optional WebSocket account watcher: wakes the deposit monitor on
            //    account changes. Polling remains authoritative either way.
            if (config.SOLANA_WS_URL) {
                watcher = new ws_watcher_1.SolanaAccountWatcher(config.rpcUrl, config.SOLANA_WS_URL, config.COMMITMENT, logger, () => void deposits.pollOnce());
                watcher.start();
                const reconcile = async () => {
                    try {
                        const wallets = await repos.allWallets();
                        await watcher?.setAddresses(wallets.filter((w) => w.active !== false).map((w) => w.address));
                    }
                    catch {
                        // reconcile failure is non-fatal
                    }
                };
                void reconcile();
                watcherTimer = setInterval(() => void reconcile(), 30_000);
                watcherTimer.unref?.();
            }
            // 4. Deposit monitor + copy-trade monitor + real AI Sniper engine.
            deposits.start();
            copytrade.start();
            sniper.start();
            // 5. Telegram polling (long-running, resilient).
            //    A 409 conflict (another instance polling the same bot token, or a
            //    leftover webhook) must NOT kill the service: retry with backoff
            //    and log clear remediation steps — polling resumes automatically
            //    once the other instance stops or the webhook is cleared.
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            void (async () => {
                let attempt = 0;
                for (;;) {
                    attempt += 1;
                    try {
                        await bot.start({
                            onStart: (info) => {
                                attempt = 0; // healthy — reset the backoff counter
                                logger.info({ botUsername: info.username }, 'Telegram polling started');
                            },
                            allowed_updates: ['message', 'callback_query'],
                            drop_pending_updates: false,
                        });
                        return; // bot stopped normally during shutdown
                    }
                    catch (err) {
                        const message = err instanceof Error ? err.message : String(err);
                        const isConflict = message.includes('409');
                        if (isConflict) {
                            logger.error({ attempt, err: message }, 'Telegram polling conflict (409): another instance is using this bot token');
                            if (attempt === 1) {
                                logger.error('Fix the conflict: stop the other bot instance (local machine? another Render service?), ' +
                                    'or clear the webhook. Check status: GET https://api.telegram.org/bot<TOKEN>/getWebhookInfo ' +
                                    'and clear it: GET https://api.telegram.org/bot<TOKEN>/deleteWebhook');
                            }
                        }
                        else {
                            logger.error({ attempt, err: message }, 'Telegram polling crashed; retrying with backoff');
                        }
                        try {
                            await bot.stop(); // reset polling state so start() can run again
                        }
                        catch {
                            // stop() may throw while not running — safe to ignore
                        }
                        const delay = Math.min(5_000 * 2 ** Math.min(attempt - 1, 5), 120_000);
                        await sleep(delay);
                    }
                }
            })();
        },
        async stop() {
            if (watcherTimer)
                clearInterval(watcherTimer);
            watcher?.stop();
            deposits.stop();
            copytrade.stop();
            sniper.stop();
            try {
                await bot.stop();
            }
            catch {
                // bot may already be stopped
            }
            health.close();
            await database.pool.end();
        },
    };
}
//# sourceMappingURL=app.js.map