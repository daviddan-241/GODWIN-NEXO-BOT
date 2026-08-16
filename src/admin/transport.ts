/**
 * Admin transport: sends messages to admin chat IDs via the real
 * Telegram Bot API. The bot token is read from config and never logged.
 */
import type { AppConfig } from '../config/env';

export interface AdminTransport {
  sendMessage(chatId: number, text: string): Promise<void>;
}

export class TelegramAdminTransport implements AdminTransport {
  constructor(private config: AppConfig) {}

  async sendMessage(chatId: number, text: string): Promise<void> {
    const url = `${this.config.telegramApiRoot}/bot${this.config.BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram sendMessage failed (HTTP ${res.status}): ${body.slice(0, 200)}`);
    }
  }
}
