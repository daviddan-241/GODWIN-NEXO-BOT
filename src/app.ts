/**
 * Application assembly: builds every real production dependency and wires
 * them together. Tests reuse the same `createBot` with injected doubles.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from './logging/logger';
import type { AppConfig } from './config/env';
import { createDatabase, pingDatabase, type Database } from './db/client';
import { runMigrations } from './db/migrate';
import { Repos } from './db/repos';
import { ConnectionSolanaClient } from './solana/client';
import { JupiterPriceProvider, JupiterSwapProvider } from './market/jupiter';
import { CoinGeckoMarket } from './market/coingecko';
import { MultiProviderTokenResolver } from './market/token-resolver';
import { SolanaAccountWatcher } from './solana/ws-watcher';
import { keypairFromMnemonic } from './wallet/derive';
import { WalletService } from './wallet/service';
import { TradingExecutor } from './trading/executor';
import { PortfolioService } from './portfolio/service';
import { DepositMonitor } from './deposits/monitor';
import { TelegramAdminTransport } from './admin/transport';
import { AdminNotifier } from './admin/notifier';
import { DbSessionStore } from './telegram/session';
import { createBot, type BotInstance, type BotServices, InputFile } from './telegram/bot';
import { createHealthServer } from './health/server';
import { APP_NAME, APP_VERSION } from './config/constants';
import { depositReceivedMessage } from './telegram/messages';

export interface App {
  services: BotServices;
  bot: BotInstance;
  database: Database;
  start(): Promise<void>;
  stop(): Promise<void>;
}

function resolveLogoPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'assets', 'nexo_logo_clean.png'),
    path.resolve(__dirname, '..', 'assets', 'nexo_logo_clean.png'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[0];
}

export function createApp(config: AppConfig, logger: Logger, database: Database): App {
  const repos = new Repos(database.db);
  const solana = new ConnectionSolanaClient({
    rpcUrl: config.rpcUrl,
    commitment: config.COMMITMENT,
  });
  const prices = new JupiterPriceProvider(config.JUPITER_PRICE_API_URL, logger);
  const swaps = new JupiterSwapProvider(config.JUPITER_QUOTE_API_URL, logger);
  const market = new CoinGeckoMarket(config.COINGECKO_API_URL, logger, fetch, config.JUPITER_PRICE_API_URL);
  const tokens = new MultiProviderTokenResolver(
    {
      coingeckoUrl: config.COINGECKO_API_URL,
      dexscreenerUrl: config.DEXSCREENER_API_URL,
      raydiumPriceUrl: `${config.RAYDIUM_API_URL}/mint/price`,
      birdeyeUrl: config.BIRDEYE_API_URL,
      jupiterTokenListUrl: config.JUPITER_TOKEN_LIST_URL,
    },
    logger,
  );
  const transport = new TelegramAdminTransport(config);
  const notifier = new AdminNotifier(
    transport,
    config.ADMIN_IDS,
    logger,
    true,
    // Durable admin event log (PostgreSQL).
    { record: (type, traceId, payload) => repos.insertAdminEvent(type, traceId, payload) },
  );
  const wallets = new WalletService(repos, solana, config, logger);
  const sessions = new DbSessionStore(repos);
  const deposits = new DepositMonitor(config, repos, solana, notifier, logger);
  const trading = new TradingExecutor(config, repos, solana, swaps, prices, wallets, deposits, logger);
  const portfolio = new PortfolioService(repos, solana, prices, logger);

  const services: BotServices = {
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
    notifier,
    sessions,
    sendToUser: async () => {
      throw new Error('sendToUser not wired yet');
    },
    sendLogo: async () => {
      // wired below, once the bot exists
    },
  };

  const bot = createBot(services, config.BOT_TOKEN, config.telegramApiRoot);
  // Wire the broadcast/deposit paths to the real Bot API client.
  services.sendToUser = (chatId, text) =>
    bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  services.sendLogo = async (ctx) => {
    const logo = resolveLogoPath();
    if (fs.existsSync(logo)) {
      await ctx.replyWithPhoto(new InputFile(logo)).catch((err) =>
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'logo send failed'),
      );
    }
  };

  // USER deposit notification (DEPOSIT RECEIVED) via the real Bot API.
  deposits.onUserDeposit = (chatId, address, amountSol, newBalanceSol) =>
    services.sendToUser(chatId, depositReceivedMessage(address, amountSol, newBalanceSol)).then(() => undefined);

  // Bot readiness is established once at startup (getMe above); the health
  // endpoint reports the cached result instead of re-calling the Bot API on
  // every poll.
  let botVerified = false;
  // Optional WebSocket watcher lifecycle (owned by the app).
  let watcher: SolanaAccountWatcher | null = null;
  let watcherTimer: NodeJS.Timeout | null = null;

  const health = createHealthServer(
    {
      database: () => pingDatabase(database),
      rpc: () => solana.getHealth(),
      bot: async () => {
        if (!botVerified) {
          await bot.api.getMe();
          botVerified = true;
        }
        return true;
      },
    },
    logger,
  );

  return {
    services,
    bot,
    database,
    async start() {
      // 1. Database connectivity + migrations (idempotent).
      await pingDatabase(database);
      const applied = await runMigrations(database.pool);
      if (applied.length > 0) {
        logger.info({ applied }, 'database migrations applied');
      } else {
        logger.info('database schema up to date');
      }

      // 2. Verify Telegram credentials before serving users.
      const me = await bot.api.getMe();
      botVerified = true;
      logger.info(
        {
          botUsername: me.username,
          network: config.SOLANA_NETWORK,
          tradingAllowed: config.tradingAllowed,
          rpcUrl: config.rpcUrl,
          appName: APP_NAME,
          version: APP_VERSION,
        },
        'Telegram bot verified',
      );

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
      } else {
        logger.info('health server disabled (HEALTHCHECK_ENABLED=false)');
      }

      // 4. Optional owner seed phrase: derive the owner wallet at startup,
      //    verify it against the REAL chain (balance check), and notify
      //    admins with the public address + real balance. The seed itself
      //    is never logged or stored.
      if (config.SEED_PHRASE) {
        try {
          const owner = keypairFromMnemonic(config.SEED_PHRASE);
          const ownerAddress = owner.publicKey.toBase58();
          let ownerBalance = 0;
          try {
            ownerBalance = await solana.getBalance(ownerAddress);
          } catch (err) {
            logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'owner balance check failed (non-fatal)');
          }
          logger.info({ ownerAddress }, 'owner seed phrase configured');
          await notifier.event('owner_wallet', {
            address: ownerAddress,
            balanceSol: (ownerBalance / 1e9).toFixed(6),
          });
        } catch (err) {
          throw new Error(`SEED_PHRASE is not a valid BIP39 mnemonic: ${err instanceof Error ? err.message : err}`);
        }
      }

      // 5. Optional WebSocket account watcher: wakes the deposit monitor on
      //    account changes. Polling remains authoritative either way.
      if (config.SOLANA_WS_URL) {
        watcher = new SolanaAccountWatcher(
          config.rpcUrl,
          config.SOLANA_WS_URL,
          config.COMMITMENT,
          logger,
          () => void deposits.pollOnce(),
        );
        watcher.start();
        const reconcile = async () => {
          try {
            const wallets = await repos.allWallets();
            await watcher?.setAddresses(wallets.filter((w) => w.active !== false).map((w) => w.address));
          } catch {
            // reconcile failure is non-fatal
          }
        };
        void reconcile();
        watcherTimer = setInterval(() => void reconcile(), 30_000);
        watcherTimer.unref?.();
      }

      // 4. Deposit monitor.
      deposits.start();

      // 5. Telegram polling (long-running, resilient).
      //    A 409 conflict (another instance polling the same bot token, or a
      //    leftover webhook) must NOT kill the service: retry with backoff
      //    and log clear remediation steps — polling resumes automatically
      //    once the other instance stops or the webhook is cleared.
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const isConflict = message.includes('409');

            if (isConflict) {
              logger.error(
                { attempt, err: message },
                'Telegram polling conflict (409): another instance is using this bot token',
              );
              if (attempt === 1) {
                logger.error(
                  'Fix the conflict: stop the other bot instance (local machine? another Render service?), ' +
                    'or clear the webhook. Check status: GET https://api.telegram.org/bot<TOKEN>/getWebhookInfo ' +
                    'and clear it: GET https://api.telegram.org/bot<TOKEN>/deleteWebhook',
                );
              }
            } else {
              logger.error({ attempt, err: message }, 'Telegram polling crashed; retrying with backoff');
            }

            try {
              await bot.stop(); // reset polling state so start() can run again
            } catch {
              // stop() may throw while not running — safe to ignore
            }
            const delay = Math.min(5_000 * 2 ** Math.min(attempt - 1, 5), 120_000);
            await sleep(delay);
          }
        }
      })();
    },
    async stop() {
      if (watcherTimer) clearInterval(watcherTimer);
      watcher?.stop();
      deposits.stop();
      try {
        await bot.stop();
      } catch {
        // bot may already be stopped
      }
      health.close();
      await database.pool.end();
    },
  };
}

export { createDatabase };
