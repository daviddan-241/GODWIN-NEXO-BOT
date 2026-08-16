/**
 * A real HTTP server implementing the subset of the Telegram Bot API
 * protocol used by grammY long polling (getMe, getUpdates, sendMessage,
 * answerCallbackQuery, editMessageText, setMyCommands).
 *
 * Used ONLY by tests: the bot is pointed at this server via
 * TELEGRAM_API_ROOT, so every navigation flow is exercised end-to-end
 * over the real wire protocol without touching api.telegram.org.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OutgoingMessage {
  method: string;
  chat_id: number;
  text?: string;
  payload: unknown;
}

export interface EnqueuedUpdate {
  update: unknown;
}

export class MockBotApiServer {
  url = '';
  private server: http.Server;
  private pending: unknown[] = [];
  private waiters: Array<(updates: unknown[]) => void> = [];
  outgoing: OutgoingMessage[] = [];
  logRequests = false;
  private updateCounter = 1000;
  private botInfo = {
    id: 777000,
    is_bot: true,
    first_name: 'HfiveTestBot',
    username: 'hfive_test_bot',
  };

  constructor() {
    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        void this.route(req, res, body);
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', () => resolve()));
    const address = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    this.waiters.forEach((w) => w([]));
    this.waiters = [];
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  // ---- update injection ------------------------------------------------

  enqueueText(chatId: number, text: string, from?: { id: number; first_name?: string; username?: string }): void {
    // Real Telegram attaches a bot_command entity to commands; grammY's
    // command filter relies on it, so the mock must mirror that.
    const commandMatch = /^\/([a-zA-Z0-9_]+)/.exec(text);
    const entities = commandMatch
      ? [{ type: 'bot_command', offset: 0, length: commandMatch[0].length }]
      : undefined;

    this.pushUpdate({
      update_id: ++this.updateCounter,
      message: {
        message_id: this.updateCounter,
        from: { id: from?.id ?? chatId, is_bot: false, first_name: from?.first_name ?? 'Tester', ...(from?.username ? { username: from.username } : {}) },
        chat: { id: chatId, type: 'private', first_name: from?.first_name ?? 'Tester' },
        date: Math.floor(Date.now() / 1000),
        text,
        ...(entities ? { entities } : {}),
      },
    });
  }

  enqueueCallback(chatId: number, data: string, originalText = 'menu'): void {
    this.pushUpdate({
      update_id: ++this.updateCounter,
      callback_query: {
        id: String(this.updateCounter),
        from: { id: chatId, is_bot: false, first_name: 'Tester' },
        message: {
          message_id: this.updateCounter - 1,
          from: this.botInfo,
          chat: { id: chatId, type: 'private', first_name: 'Tester' },
          date: Math.floor(Date.now() / 1000),
          text: originalText,
        },
        chat_instance: 'test',
        data,
      },
    });
  }

  private pushUpdate(update: unknown): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter([update]);
    else this.pending.push(update);
  }

  // ---- HTTP routing ----------------------------------------------------

  private async route(req: http.IncomingMessage, res: http.ServerResponse, body: string): Promise<void> {
    const match = (req.url ?? '').match(/^\/bot[^/]+\/([a-zA-Z]+)$/);
    res.setHeader('Content-Type', 'application/json');
    if (!match) {
      res.end(JSON.stringify({ ok: false, description: 'bad url' }));
      return;
    }
    const method = match[1];
    const payload = body ? JSON.parse(body) : {};
    if (this.logRequests) console.error(`[mock-bot-api] ${method} ${body.slice(0, 120)}`);

    switch (method) {
      case 'getMe': {
        res.end(JSON.stringify({ ok: true, result: this.botInfo }));
        return;
      }
      case 'setMyCommands': {
        res.end(JSON.stringify({ ok: true, result: true }));
        return;
      }
      case 'getUpdates': {
        const { offset = 0 } = payload as { offset?: number };
        const due = this.pending.filter((u) => (u as { update_id: number }).update_id > offset);
        if (due.length > 0) {
          this.pending = [];
          res.end(JSON.stringify({ ok: true, result: due }));
          return;
        }
        // Long-poll: wait briefly for an update, then return empty.
        const waiter = (updates: unknown[]): void => {
          if (!res.writableEnded) res.end(JSON.stringify({ ok: true, result: updates }));
        };
        this.waiters.push(waiter);
        setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0) {
            this.waiters.splice(idx, 1);
            if (!res.writableEnded) res.end(JSON.stringify({ ok: true, result: [] }));
          }
        }, 250);
        return;
      }
      case 'sendMessage': {
        const p = payload as { chat_id: number; text?: string; reply_markup?: unknown };
        this.outgoing.push({ method, chat_id: p.chat_id, text: p.text, payload });
        res.end(
          JSON.stringify({
            ok: true,
            result: { message_id: ++this.updateCounter, chat: { id: p.chat_id }, text: p.text },
          }),
        );
        return;
      }
      case 'answerCallbackQuery':
      case 'editMessageText':
      case 'editMessageReplyMarkup':
      case 'deleteMessage':
      case 'deleteWebhook':
      case 'sendChatAction': {
        const p = payload as { chat_id?: number };
        this.outgoing.push({ method, chat_id: p.chat_id ?? 0, payload });
        res.end(JSON.stringify({ ok: true, result: true }));
        return;
      }
      default: {
        res.end(JSON.stringify({ ok: false, description: `unsupported method ${method}` }));
      }
    }
  }

  // ---- assertions ------------------------------------------------------

  /** Waits until an outgoing message matching `pred` appears. */
  async waitForOutgoing(
    pred: (m: OutgoingMessage) => boolean,
    timeoutMs = 10_000,
  ): Promise<OutgoingMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.outgoing.find(pred);
      if (found) return found;
      if (Date.now() - start > timeoutMs) {
        const recent = this.outgoing.slice(-10).map((m) => `${m.method}->${m.chat_id}: ${(m.text ?? '').slice(0, 80)}`);
        throw new Error(`Timed out waiting for outgoing message.\nRecent outgoing:\n${recent.join('\n')}`);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  waitForText(chatId: number, includes: string, timeoutMs = 10_000): Promise<OutgoingMessage> {
    return this.waitForOutgoing(
      (m) => m.chat_id === chatId && (m.text ?? '').includes(includes),
      timeoutMs,
    );
  }

  clearOutgoing(): void {
    this.outgoing = [];
  }
}
