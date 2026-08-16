/**
 * Simple sliding-window rate limiter for Telegram updates (per chat).
 * Abusive floods are dropped before they reach any handler.
 */
export class RateLimiter {
  private hits = new Map<number, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  allow(chatId: number): boolean {
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
  prune(): void {
    const now = Date.now();
    for (const [chatId, arr] of this.hits) {
      if (arr.every((t) => now - t > this.windowMs * 2)) this.hits.delete(chatId);
    }
  }
}
