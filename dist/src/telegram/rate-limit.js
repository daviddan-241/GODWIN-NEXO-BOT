"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
/**
 * Simple sliding-window rate limiter for Telegram updates (per chat).
 * Abusive floods are dropped before they reach any handler.
 */
class RateLimiter {
    max;
    windowMs;
    hits = new Map();
    constructor(max, windowMs) {
        this.max = max;
        this.windowMs = windowMs;
    }
    allow(chatId) {
        const now = Date.now();
        const cutoff = now - this.windowMs;
        const arr = (this.hits.get(chatId) ?? []).filter((t) => t > cutoff);
        if (arr.length >= this.max) {
            this.hits.set(chatId, arr); // keep the window saturated
            return false;
        }
        arr.push(now);
        this.hits.set(chatId, arr);
        return true;
    }
    /** Drops idle chats so the map cannot grow unbounded. */
    prune() {
        const now = Date.now();
        for (const [chatId, arr] of this.hits) {
            if (arr.every((t) => now - t > this.windowMs * 2))
                this.hits.delete(chatId);
        }
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rate-limit.js.map