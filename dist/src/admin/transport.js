"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramAdminTransport = void 0;
class TelegramAdminTransport {
    config;
    constructor(config) {
        this.config = config;
    }
    async sendMessage(chatId, text) {
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
exports.TelegramAdminTransport = TelegramAdminTransport;
//# sourceMappingURL=transport.js.map