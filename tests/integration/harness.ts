/**
 * Integration test harness: assembles the REAL application layers
 * (config, DB, repos, wallet crypto, trading executor, deposit monitor,
 * telegram handlers) and substitutes ONLY the external I/O boundaries:
 *  - Telegram Bot API  -> MockBotApiServer (real HTTP + long polling)
 *  - Solana RPC        -> FakeSolanaClient (in-memory)
 *  - Jupiter APIs      -> FakePriceProvider / FakeSwapProvider
 *  - Admin transport   -> FakeAdminTransport (captures messages)
 */
import { createDatabase, type Database } from '../../src/db/client';
import { runMigrations } from '../../src/db/migrate';
import { Repos } from '../../src/db/repos';
import { WalletService } from '../../src/wallet/service';
import { TradingExecutor } from '../../src/trading/executor';
import { PortfolioService } from '../../src/portfolio/service';
import { DepositMonitor } from '../../src/deposits/monitor';
import { AdminNotifier } from '../../src/admin/notifier';
import { DbSessionStore } from '../../src/telegram/session';
import { createBot, type BotInstance, type BotServices } from '../../src/telegram/bot';
import type { AppConfig } from '../../src/config/env';
import { makeConfig, TEST_DB_URL } from '../helpers/test-env';
import { MockBotApiServer } from '../helpers/mock-bot-api';
import { CoinGeckoMarket } from '../../src/market/coingecko';
import { FakeTokenSearch } from '../helpers/fakes';
import {
  FakeSolanaClient,
  FakePriceProvider,
  FakeSwapProvider,
  FakeAdminTransport,
} from '../helpers/fakes';
import { createTestLogger } from '../helpers/logger';

export interface TestApp {
  bot: BotInstance;
  mockBot: MockBotApiServer;
  database: Database;
  services: BotServices;
  solana: FakeSolanaClient;
  prices: FakePriceProvider;
  swaps: FakeSwapProvider;
  tokens: FakeTokenSearch;
  admin: FakeAdminTransport;
  notifier: AdminNotifier;
  config: AppConfig;
  cleanup: () => Promise<void>;
}

export async function startTestApp(configOverrides: Record<string, string> = {}): Promise<TestApp> {
  if (!TEST_DB_URL) {
    throw new Error('TEST_DATABASE_URL is required for integration tests');
  }

  const mockBot = new MockBotApiServer();
  await mockBot.start();

  const config = makeConfig({ TELEGRAM_API_ROOT: mockBot.url, ...configOverrides });
  const { logger } = createTestLogger();

  const database = createDatabase(TEST_DB_URL);
  await runMigrations(database.pool);
  await database.pool.query(
    'TRUNCATE users, wallets, trades, deposits, balance_snapshots, bot_sessions, user_settings CASCADE',
  );

  const repos = new Repos(database.db);
  const solana = new FakeSolanaClient();
  const prices = new FakePriceProvider();
  const swaps = new FakeSwapProvider();
  const admin = new FakeAdminTransport();
  const market = new CoinGeckoMarket('https://coingecko.invalid', logger, async () => {
    throw new Error('no network in tests');
  });
  const tokens = new FakeTokenSearch();
  const notifier = new AdminNotifier(admin, config.ADMIN_IDS, logger, true, {
    record: (type, traceId, payload) => repos.insertAdminEvent(type, traceId, payload),
  });
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
      throw new Error('not wired');
    },
    sendTerminal: async (ctx, caption, keyboard) => {
      // Send the REAL logo photo + caption through the mock Bot API so
      // tests exercise the exact production path (multipart sendPhoto).
      const { InputFile } = await import('grammy');
      const { resolveLogoPath } = await import('../../src/telegram/logo');
      const logo = resolveLogoPath();
      const { existsSync } = await import('node:fs');
      if (existsSync(logo)) {
        await ctx.replyWithPhoto(new InputFile(logo), {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
      }
    },
  };

  const bot = createBot(services, 'test-bot-token', mockBot.url);
  services.sendToUser = (chatId, text) =>
    bot.api.sendMessage(chatId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });

  // grammY start() runs getMe + long polling; await init() so the bot is
  // verified before tests begin, then leave polling running.
  await bot.init();
  void bot.start({ allowed_updates: ['message', 'callback_query'], drop_pending_updates: false });

  return {
    bot,
    mockBot,
    database,
    services,
    solana,
    prices,
    swaps,
    tokens,
    admin,
    notifier,
    config,
    cleanup: async () => {
      deposits.stop();
      try {
        await bot.stop();
      } catch {
        // already stopped
      }
      await mockBot.close();
      await database.pool.end();
    },
  };
}

/** Small delay helper to let the polling loop pick updates up. */
export async function settle(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
