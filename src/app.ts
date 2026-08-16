/**
 * Application assembly: builds every real production dependency and wires
 * them together. Tests reuse the same `createBot` with injected doubles.
 */
import type { Logger } from './logging/logger';
import type { AppConfig } from './config/env';
import { createDatabase, pingDatabase, type Database } from './db/client';
import { runMigrations } from './db/migrate';
import { Repos } from './db/repos';
import { ConnectionSolanaClient } from './solana/client';
import { JupiterPriceProvider, JupiterSwapProvider } from './market/jupiter';
import { WalletService } from './wallet/service';
import { TradingExecutor } from './trading/executor';
import { PortfolioService } from './portfolio/service';
import { DepositMonitor } from './deposits/monitor';
import { TelegramAdminTransport } from './admin/transport';
import { AdminNotifier } from './admin/notifier';
import { DbSessionStore } from './telegram/session';
import { createBot, type BotInstance, type BotServices } from './telegram/bot';
import { createHealthServer } from './health/server';

export interface App {
  services: BotServices;
  bot: BotInstance;
  database: Database;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createApp(config: AppConfig, logger: Logger, database: Database): App {
  const repos = new Repos(database.db);
  const solana = new ConnectionSolanaClient({
    rpcUrl: config.rpcUrl,
    commitment: config.COMMITMENT,
  });
  const prices = new JupiterPriceProvider(config.JUPITER_PRICE_API_URL, logger);
  const swaps = new JupiterSwapProvider(config.JUPITER_QUOTE_API_URL, logger);
  const transport = new TelegramAdminTransport(config);
  const notifier = new AdminNotifier(transport, config.ADMIN_CHAT_IDS, logger);
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
    wallets,
    trading,
    portfolio,
    deposits,
    notifier,
    sessions,
    sendToUser: async () => {
      throw new Error('sendToUser not wired yet');
    },
  };

  const bot = createBot(services, config.BOT_TOKEN, config.telegramApiRoot);
  // Wire the broadcast path to the real Bot API client.
  services.sendToUser = (chatId, text) =>
    bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });

  // Bot readiness is established once at startup (getMe above); the health
  // endpoint reports the cached result instead of re-calling the Bot API on
  // every poll.
  let botVerified = false;

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
        },
        'Telegram bot verified',
      );

      await bot.api
        .setMyCommands([
          { command: 'start', description: 'Main menu' },
          { command: 'wallet', description: 'Wallet info' },
          { command: 'portfolio', description: 'Balances and P/L' },
          { command: 'buy', description: 'Buy a token' },
          { command: 'sell', description: 'Sell a token' },
          { command: 'deposit', description: 'Deposit address' },
          { command: 'withdraw', description: 'Withdraw funds' },
          { command: 'settings', description: 'Trading preferences' },
          { command: 'cancel', description: 'Abort current action' },
        ])
        .catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'setMyCommands failed (non-fatal)'));

      // 3. Health server.
      health.listen(config.PORT, '0.0.0.0', () => {
        logger.info({ port: config.PORT }, 'health server listening on 0.0.0.0');
      });

      // 4. Deposit monitor.
      deposits.start();

      // 5. Telegram polling (long-running).
      void bot
        .start({
          onStart: (info) => logger.info({ botUsername: info.username }, 'Telegram polling started'),
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: false,
        })
        .catch((err) => {
          logger.fatal({ err: err instanceof Error ? err.message : String(err) }, 'Telegram polling crashed');
          process.exit(1);
        });
    },
    async stop() {
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
