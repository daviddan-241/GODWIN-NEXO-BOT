/**
 * Telegram bot layer: grammY wiring for the NEXO TRADING TERMINAL UI,
 * session middleware, command/callback routing and the dependency
 * container handed to handlers.
 */
import { Bot, Context } from 'grammy';
import type { InlineKeyboard } from 'grammy';
import type { Logger } from '../logging/logger';
import type { AppConfig } from '../config/env';
import type { Repos } from '../db/repos';
import type { SolanaClient } from '../solana/types';
import type { PriceProvider, SwapProvider } from '../market/types';
import type { CoinGeckoMarket } from '../market/coingecko';
import type { TokenSearchProvider } from '../market/token-resolver';
import type { WalletService } from '../wallet/service';
import type { TradingExecutor } from '../trading/executor';
import type { PortfolioService } from '../portfolio/service';
import type { DepositMonitor } from '../deposits/monitor';
import type { AdminNotifier } from '../admin/notifier';
import type { SessionData, SessionStore } from './session';
import { RateLimiter } from './rate-limit';
import { dashboard } from './handlers/nexo';
import {
  startHandler,
  dashboardHandler,
  refreshHandler,
  helpHandler,
  cancelHandler,
  walletHandler,
  generateWalletHandler,
  walletImportPromptHandler,
  walletSeedPromptHandler,
  walletImportHandleSecretHandler,
  walletStatusHandler,
  walletRefreshHandler,
  walletDisconnectHandler,
  walletRobinhoodHandler,
  tradeWalletPickHandler,
  withdrawStartHandler,
  withdrawAddressHandler,
  withdrawAmountHandler,
  withdrawConfirmHandler,
  discoverHandler,
  tradeHandler,
  tradeBuyStartHandler,
  tradeSellStartHandler,
  searchTokenHandler,
  buyFromSearchHandler,
  buyFromTradeHandler,
  buyConfirmHandler,
  sellFromSearchHandler,
  sellFromTradeHandler,
  sellAmountHandler,
  positionsHandler,
  sniperHandler,
  sniperActivateHandler,
  sniperPauseHandler,
  sniperAntiRugHandler,
  sniperSettingPromptHandler,
  sniperSettingValueHandler,
  copyTradeHandler,
  copyTradeStartHandler,
  copyTradeConfigurePromptHandler,
  copyTradeAddHandler,
  copyTradeModeHandler,
  copyTradeLimitsPromptHandler,
  copyTradeLimitsValueHandler,
  statsHandler,
  broadcastHandler,
} from './handlers/nexo';
import { resetToIdle } from './handlers/common';
import { IDLE_STATE } from './session';

export interface BotServices {
  config: AppConfig;
  logger: Logger;
  repos: Repos;
  solana: SolanaClient;
  prices: PriceProvider;
  swaps: SwapProvider;
  market: CoinGeckoMarket;
  tokens: TokenSearchProvider;
  wallets: WalletService;
  trading: TradingExecutor;
  portfolio: PortfolioService;
  deposits: DepositMonitor;
  notifier: AdminNotifier;
  sessions: SessionStore;
  /** Sends a message to an arbitrary chat (wired to bot.api after construction). */
  sendToUser: (chatId: number, text: string) => Promise<unknown>;
  /**
   * Sends the terminal as ONE message: the NEXO logo photo with the
   * terminal text as its caption and the inline keyboard attached.
   */
  sendTerminal: (ctx: BotContext, caption: string, keyboard: InlineKeyboard) => Promise<void>;
}

export type BotContext = Context & { session: SessionData; services: BotServices };
export type BotInstance = Bot<BotContext>;

export function createBot(services: BotServices, token: string, apiRoot?: string): BotInstance {
  const bot = new Bot<BotContext>(
    token,
    apiRoot ? { client: { apiRoot } } : undefined,
  );

  // ------------------------------------------------------------------
  // Hardening middleware: per-chat rate limiting + DB-backed session
  // load with conversation timeouts, then persist after handling.
  // ------------------------------------------------------------------
  const rateLimiter = new RateLimiter(
    services.config.RATE_LIMIT_MAX,
    services.config.RATE_LIMIT_WINDOW_MS,
  );
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
    if (ctx.session.state !== IDLE_STATE && age > services.config.CONVERSATION_TIMEOUT_MS) {
      ctx.session.state = IDLE_STATE;
      ctx.session.payload = {};
    }

    try {
      await next();
    } finally {
      try {
        await services.sessions.save(chatId, ctx.session);
      } catch (err) {
        services.logger.error(
          { chatId, err: err instanceof Error ? err.message : String(err) },
          'failed to persist session',
        );
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
  bot.command('start', (ctx) => startHandler(ctx));
  bot.command('menu', (ctx) => dashboardHandler(ctx));
  bot.command('wallet', (ctx) => walletHandler(ctx));
  bot.command('generate', (ctx) => generateWalletHandler(ctx));
  bot.command('import', (ctx) => walletImportPromptHandler(ctx));
  bot.command('status', (ctx) => walletStatusHandler(ctx));
  bot.command('disconnect', (ctx) => walletDisconnectHandler(ctx));
  bot.command('help', (ctx) => helpHandler(ctx));
  bot.command('discover', (ctx) => discoverHandler(ctx));
  bot.command('cancel', (ctx) => cancelHandler(ctx));
  bot.command('stats', (ctx) => statsHandler(ctx));
  bot.command('broadcast', (ctx) => broadcastHandler(ctx, ctx.match.trim()));

  // ------------------------------------------------------------------
  // Callback queries (inline keyboard actions).
  // ------------------------------------------------------------------
  bot.callbackQuery('back_dashboard', (ctx) => dashboardHandler(ctx));
  bot.callbackQuery('refresh', (ctx) => refreshHandler(ctx));
  bot.callbackQuery('wallet', (ctx) => walletHandler(ctx));
  bot.callbackQuery('wallet_add', (ctx) => generateWalletHandler(ctx));
  bot.callbackQuery('wallet_import', (ctx) => walletImportPromptHandler(ctx));
  bot.callbackQuery('wallet_seed', (ctx) => walletSeedPromptHandler(ctx));
  bot.callbackQuery('wallet_status', (ctx) => walletStatusHandler(ctx));
  bot.callbackQuery('wallet_refresh', (ctx) => walletRefreshHandler(ctx));
  bot.callbackQuery('wallet_withdraw', (ctx) => withdrawStartHandler(ctx));
  bot.callbackQuery('wallet_disconnect', (ctx) => walletDisconnectHandler(ctx));
  bot.callbackQuery('wallet_robinhood', (ctx) => walletRobinhoodHandler(ctx));
  bot.callbackQuery('discover', (ctx) => discoverHandler(ctx));
  bot.callbackQuery('trade', (ctx) => tradeHandler(ctx));
  bot.callbackQuery('buy_sol', (ctx) => tradeBuyStartHandler(ctx));
  bot.callbackQuery('sell_token', (ctx) => tradeSellStartHandler(ctx));
  bot.callbackQuery('positions', (ctx) => positionsHandler(ctx));
  bot.callbackQuery('sniper', (ctx) => sniperHandler(ctx));
  bot.callbackQuery('sniper_activate', (ctx) => sniperActivateHandler(ctx));
  bot.callbackQuery('sniper_pause', (ctx) => sniperPauseHandler(ctx));
  bot.callbackQuery('sniper_buyamount', (ctx) => sniperSettingPromptHandler('setting_position_size')(ctx));
  bot.callbackQuery('sniper_devhold', (ctx) => sniperSettingPromptHandler('setting_dev_hold')(ctx));
  bot.callbackQuery('sniper_slippage', (ctx) => sniperSettingPromptHandler('setting_slippage')(ctx));
  bot.callbackQuery('sniper_priority', (ctx) => sniperSettingPromptHandler('setting_priority')(ctx));
  bot.callbackQuery('sniper_takeprofit', (ctx) => sniperSettingPromptHandler('setting_take_profit')(ctx));
  bot.callbackQuery('sniper_stoploss', (ctx) => sniperSettingPromptHandler('setting_stop_loss')(ctx));
  bot.callbackQuery('sniper_antirug', (ctx) => sniperAntiRugHandler(ctx));
  bot.callbackQuery('copytrade', (ctx) => copyTradeHandler(ctx));
  bot.callbackQuery('copytrade_start', (ctx) => copyTradeStartHandler(ctx));
  bot.callbackQuery('copytrade_add', (ctx) => copyTradeConfigurePromptHandler(ctx));
  bot.callbackQuery('copytrade_mode', (ctx) => copyTradeModeHandler(ctx));
  bot.callbackQuery('copytrade_limits', (ctx) => copyTradeLimitsPromptHandler(ctx));
  bot.callbackQuery(/^tw_(.+)$/, (ctx) => tradeWalletPickHandler(ctx, ctx.match[1]));
  bot.callbackQuery('help', (ctx) => helpHandler(ctx));
  bot.callbackQuery('cancel', (ctx) => cancelHandler(ctx));
  bot.callbackQuery('withdraw_confirm', (ctx) => withdrawConfirmHandler(ctx));
  bot.callbackQuery('confirm_buy', (ctx) => buyConfirmHandler(ctx));
  bot.callbackQuery(/^buy_(.+)$/, (ctx) => buyFromSearchHandler(ctx, ctx.match[1]));
  bot.callbackQuery(/^sell_(.+)$/, (ctx) => sellFromSearchHandler(ctx, ctx.match[1]));

  // ------------------------------------------------------------------
  // Free-text messages: routed by the current conversation state.
  // ------------------------------------------------------------------
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return; // group chatter is ignored
    const state = ctx.session?.state ?? IDLE_STATE;
    switch (state) {
      case 'importing_wallet':
        return walletImportHandleSecretHandler(ctx);
      case 'withdrawing_address':
        return withdrawAddressHandler(ctx);
      case 'withdrawing_amount':
        return withdrawAmountHandler(ctx);
      case 'searching_token':
        return searchTokenHandler(ctx);
      case 'buying_token':
        return buyFromTradeHandler(ctx);
      case 'selling_token':
        return sellFromTradeHandler(ctx);
      case 'confirming_sell':
        return sellAmountHandler(ctx);
      case 'setting_position_size':
      case 'setting_dev_hold':
      case 'setting_slippage':
      case 'setting_priority':
      case 'setting_take_profit':
      case 'setting_stop_loss':
        return sniperSettingValueHandler(ctx);
      case 'copytrade_add':
        return copyTradeAddHandler(ctx);
      case 'copytrade_limits':
        return copyTradeLimitsValueHandler(ctx);
      default: {
        if (ctx.message.text.startsWith('/')) return;
        await resetToIdle(ctx);
        await dashboard(ctx);
      }
    }
  });

  return bot;
}


