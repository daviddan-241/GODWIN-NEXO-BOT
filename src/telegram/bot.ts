/**
 * Telegram bot layer: grammY wiring, session middleware, command and
 * callback routing, and the dependency container handed to handlers.
 */
import { Bot, Context } from 'grammy';
import type { Logger } from '../logging/logger';
import type { AppConfig } from '../config/env';
import type { Repos } from '../db/repos';
import type { SolanaClient } from '../solana/types';
import type { PriceProvider, SwapProvider } from '../market/types';
import type { WalletService } from '../wallet/service';
import type { TradingExecutor } from '../trading/executor';
import type { PortfolioService } from '../portfolio/service';
import type { DepositMonitor } from '../deposits/monitor';
import type { AdminNotifier } from '../admin/notifier';
import type { SessionData, SessionStore } from './session';
import { mainMenuKeyboard } from './keyboards';
import {
  startHandler,
  menuHandler,
  helpHandler,
  cancelHandler,
} from './handlers/menu';
import {
  showWalletHandler,
  walletCreateConfirmHandler,
  walletCreateReplaceHandler,
  walletImportPromptHandler,
  walletImportHandleSecretHandler,
  walletExportConfirmHandler,
  walletExportRevealHandler,
} from './handlers/wallet';
import { walletImportPromptHandler as importPromptHandler } from './handlers/wallet';
import { showDepositHandler } from './handlers/deposit';
import {
  withdrawStartHandler,
  withdrawPickHandler,
  withdrawAddressHandler,
  withdrawAmountHandler,
  withdrawConfirmHandler,
} from './handlers/withdraw';
import {
  buyStartHandler,
  buyTokenHandler,
  buyAmountCallbackHandler,
  buyAmountTextHandler,
  buyConfirmHandler,
} from './handlers/buy';
import {
  sellStartHandler,
  sellPickHandler,
  sellPctCallbackHandler,
  sellPctTextHandler,
  sellConfirmHandler,
} from './handlers/sell';
import { showPortfolioHandler } from './handlers/portfolio';
import {
  settingsShowHandler,
  settingsSlippageMenuHandler,
  settingsSlippageSetHandler,
  settingsSlippageCustomPromptHandler,
  settingsSlippageCustomHandler,
  settingsBuyAmountMenuHandler,
  settingsBuyAmountSetHandler,
  settingsBuyAmountCustomPromptHandler,
  settingsBuyAmountCustomHandler,
  settingsPriorityFeeMenuHandler,
  settingsPriorityFeeSetHandler,
} from './handlers/settings';
import { statsHandler, broadcastHandler } from './handlers/admin';
import { resetToIdle } from './handlers/common';

export interface BotServices {
  config: AppConfig;
  logger: Logger;
  repos: Repos;
  solana: SolanaClient;
  prices: PriceProvider;
  swaps: SwapProvider;
  wallets: WalletService;
  trading: TradingExecutor;
  portfolio: PortfolioService;
  deposits: DepositMonitor;
  notifier: AdminNotifier;
  sessions: SessionStore;
  /** Sends a message to an arbitrary chat (wired to bot.api after construction). */
  sendToUser: (chatId: number, text: string) => Promise<unknown>;
}

export type BotContext = Context & { session: SessionData; services: BotServices };
export type BotInstance = Bot<BotContext>;

export function createBot(services: BotServices, token: string, apiRoot?: string): BotInstance {
  const bot = new Bot<BotContext>(
    token,
    apiRoot ? { client: { apiRoot } } : undefined,
  );

  // ------------------------------------------------------------------
  // Session middleware: load DB-backed conversation state per update
  // and persist it after handling.
  // ------------------------------------------------------------------
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    ctx.services = services;
    if (chatId === undefined) {
      await next();
      return;
    }
    ctx.session = await services.sessions.get(chatId);
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
  // Commands.
  // ------------------------------------------------------------------
  bot.command('start', (ctx) => startHandler(ctx));
  bot.command('menu', (ctx) => menuHandler(ctx));
  bot.command('help', (ctx) => helpHandler(ctx));
  bot.command('cancel', (ctx) => cancelHandler(ctx));
  bot.command('import', (ctx) => importPromptHandler(ctx));
  bot.command('wallet', (ctx) => showWalletHandler(ctx));
  bot.command('portfolio', (ctx) => showPortfolioHandler(ctx));
  bot.command('buy', (ctx) => buyStartHandler(ctx));
  bot.command('sell', (ctx) => sellStartHandler(ctx));
  bot.command('deposit', (ctx) => showDepositHandler(ctx));
  bot.command('withdraw', (ctx) => withdrawStartHandler(ctx));
  bot.command('settings', (ctx) => settingsShowHandler(ctx));
  bot.command('stats', (ctx) => statsHandler(ctx));
  bot.command('broadcast', (ctx) => broadcastHandler(ctx, ctx.match.trim()));

  // ------------------------------------------------------------------
  // Callback queries (inline keyboard actions).
  // Routes are matched longest-prefix-first so sub-actions win.
  // ------------------------------------------------------------------
  type CallbackRoute = [string, (ctx: BotContext, arg: string) => Promise<void>];
  const routes: CallbackRoute[] = [
    ['wallet:export:reveal', (c) => walletExportRevealHandler(c)],
    ['wallet:create:replace', (c) => walletCreateReplaceHandler(c)],
    ['settings:slippage:custom', (c) => settingsSlippageCustomPromptHandler(c)],
    ['settings:buyamount:custom', (c) => settingsBuyAmountCustomPromptHandler(c)],
    ['buy:confirm', (c) => buyConfirmHandler(c)],
    ['sell:confirm', (c) => sellConfirmHandler(c)],
    ['withdraw:confirm', (c) => withdrawConfirmHandler(c)],
    ['buy:amount', (c, v) => buyAmountCallbackHandler(c, v)],
    ['buy:start', (c) => buyStartHandler(c)],
    ['sell:pick', (c, v) => sellPickHandler(c, v)],
    ['sell:pct', (c, v) => sellPctCallbackHandler(c, v)],
    ['sell:start', (c) => sellStartHandler(c)],
    ['withdraw:pick', (c, v) => withdrawPickHandler(c, v)],
    ['withdraw:start', (c) => withdrawStartHandler(c)],
    ['wallet:refresh', (c) => showWalletHandler(c)],
    ['wallet:show', (c) => showWalletHandler(c)],
    ['wallet:create', (c) => walletCreateConfirmHandler(c)],
    ['wallet:import', (c) => walletImportPromptHandler(c)],
    ['wallet:export', (c) => walletExportConfirmHandler(c)],
    ['deposit:show', (c) => showDepositHandler(c)],
    ['portfolio:show', (c) => showPortfolioHandler(c)],
    ['settings:slippage', (c, v) => (v ? settingsSlippageSetHandler(c, v) : settingsSlippageMenuHandler(c))],
    ['settings:buyamount', (c, v) => (v ? settingsBuyAmountSetHandler(c, v) : settingsBuyAmountMenuHandler(c))],
    ['settings:priofee', (c, v) => (v ? settingsPriorityFeeSetHandler(c, v) : settingsPriorityFeeMenuHandler(c))],
    ['settings:show', (c) => settingsShowHandler(c)],
    ['menu:main', (c) => menuHandler(c)],
    ['help:show', (c) => helpHandler(c)],
    ['cancel', (c) => cancelHandler(c)],
  ];
  routes.sort((a, b) => b[0].length - a[0].length);

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    let handled = false;
    for (const [prefix, fn] of routes) {
      if (data === prefix) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        await fn(ctx, '');
        handled = true;
        break;
      }
      if (data.startsWith(`${prefix}:`)) {
        await ctx.answerCallbackQuery().catch(() => undefined);
        await fn(ctx, data.slice(prefix.length + 1));
        handled = true;
        break;
      }
    }
    if (!handled) {
      await ctx.answerCallbackQuery().catch(() => undefined);
    }
  });

  // ------------------------------------------------------------------
  // Free-text messages: routed by the current conversation state.
  // ------------------------------------------------------------------
  bot.on('message:text', async (ctx) => {
    if (ctx.chat.type !== 'private') return; // group chatter is ignored
    const state = ctx.session?.state ?? 'idle';
    switch (state) {
      case 'awaiting_buy_token':
        return buyTokenHandler(ctx);
      case 'awaiting_buy_amount':
        return buyAmountTextHandler(ctx);
      case 'awaiting_sell_pct':
        return sellPctTextHandler(ctx);
      case 'awaiting_withdraw_address':
        return withdrawAddressHandler(ctx);
      case 'awaiting_withdraw_amount':
        return withdrawAmountHandler(ctx);
      case 'awaiting_import_secret':
        return walletImportHandleSecretHandler(ctx);
      case 'awaiting_custom_slippage':
        return settingsSlippageCustomHandler(ctx);
      case 'awaiting_custom_buy_amount':
        return settingsBuyAmountCustomHandler(ctx);
      default: {
        if (ctx.message.text.startsWith('/')) return;
        await resetToIdle(ctx);
        await ctx.reply('Tap a button below to navigate.', {
          parse_mode: 'HTML',
          reply_markup: mainMenuKeyboard(),
        });
      }
    }
  });

  return bot;
}
