/**
 * Shared helpers for Telegram handlers: session transitions, replies,
 * error handling and admin notifications for important events.
 */
import type { BotContext } from '../bot';
import { IDLE_STATE } from '../session';
import { escapeHtml } from '../../util/format';

export const ERROR_PREFIX = 'Something went wrong:';
export const NOT_PRIVATE_TEXT = 'This bot works in private chats. Open a chat with the bot to use it.';

export async function transition(
  ctx: BotContext,
  state: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  ctx.session.state = state;
  ctx.session.payload = payload;
}

export async function resetToIdle(ctx: BotContext): Promise<void> {
  ctx.session.state = IDLE_STATE;
  ctx.session.payload = {};
}

/** True when the update came from a private (1:1) chat with the bot. */
export function isPrivateChat(ctx: BotContext): boolean {
  return ctx.chat?.type === 'private';
}

export async function requirePrivate(ctx: BotContext): Promise<boolean> {
  if (isPrivateChat(ctx)) return true;
  await ctx.reply(NOT_PRIVATE_TEXT);
  return false;
}

export async function answerCallback(ctx: BotContext, text?: string): Promise<void> {
  // Safe for handlers that are reachable both from inline buttons and
  // slash commands (no callback_query exists in the latter case).
  if (!ctx.callbackQuery?.id) return;
  await ctx.answerCallbackQuery({ text, show_alert: false }).catch(() => undefined);
}

/**
 * Wraps every handler: logs, records a structured error event (with a
 * trace/reference ID, never secrets) and replies to the user with the
 * (non-secret) error message plus the reference ID.
 */
export function safeHandler(
  name: string,
  fn: (ctx: BotContext, ...args: string[]) => Promise<void>,
): (ctx: BotContext, ...args: string[]) => Promise<void> {
  return async (ctx, ...args) => {
    try {
      await fn(ctx, ...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.services.logger.error({ handler: name, chatId: ctx.chat?.id, err: message }, 'handler error');

      // Structured error event: event type, user (if applicable), SAFE
      // message, timestamp, trace/reference ID. Never includes secrets.
      const traceId = await ctx.services.notifier
        .event('error', {
          eventType: `handler:${name}`,
          user: ctx.chat?.id ?? null,
          safeMessage: message,
        })
        .catch(() => 'n/a');

      try {
        await ctx.reply(
          `${ERROR_PREFIX} ${escapeHtml(message)}\nReference: <code>${traceId}</code>`,
          { parse_mode: 'HTML' },
        );
      } catch {
        // reply may fail if the update was a stale callback; nothing to do
      }
      // NOTE: the conversation state is intentionally left as-is so users
      // can retry the failed step (e.g. paste a valid mnemonic again).
      // Handlers that must abort set the state themselves; /cancel resets.
    }
  };
}

export function networkLabel(ctx: BotContext): string {
  return ctx.services.config.isDevnet ? 'Devnet' : 'Mainnet';
}
