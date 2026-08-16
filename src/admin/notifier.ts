/**
 * Admin notification system: queued, retried, never blocking.
 *
 * All admin-facing events (wallet created, deposits, trades, errors) go
 * through this class. Failures are retried with backoff and logged
 * without secrets; a transport failure never crashes the bot.
 */
import type { Logger } from '../logging/logger';
import { retryWithBackoff, withTimeout } from '../util/retry';
import { truncate } from '../util/format';
import type { AdminTransport } from './transport';

export class AdminNotifier {
  constructor(
    private transport: AdminTransport,
    private adminChatIds: number[],
    private logger: Logger,
    private enabled = true,
  ) {}

  isEnabled(): boolean {
    return this.enabled && this.adminChatIds.length > 0;
  }

  /**
   * Sends a message to every admin. Delivery is best-effort: individual
   * failures are retried and logged, and never thrown to the caller.
   */
  async send(text: string): Promise<void> {
    if (!this.isEnabled()) return;

    const results = await Promise.allSettled(
      this.adminChatIds.map((chatId) =>
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
        this.logger.error({ err: r.reason instanceof Error ? r.reason.message : String(r.reason) }, 'admin notification failed permanently');
      }
    }
  }

  /** Notifies admins about an unexpected error in a flow. */
  async notifyError(context: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error({ context, err: message }, 'notifying admins of error');
    await this.send(`⚠️ <b>Error</b>\nContext: ${truncate(context, 80)}\nDetail: ${truncate(message, 300)}`);
  }

  /** Logs-only preview used by tests to assert no secrets leak into logs. */
  logSend(chatId: number, text: string): void {
    this.logger.debug({ chatId, messageLength: text.length }, 'admin message queued');
  }
}
