/** Rate limiter tests. */
import { describe, it, expect, vi } from 'vitest';
import { RateLimiter } from '../../src/telegram/rate-limit';

describe('telegram/rate-limit', () => {
  it('allows up to the max within the window', () => {
    const limiter = new RateLimiter(3, 10_000);
    expect(limiter.allow(1)).toBe(true);
    expect(limiter.allow(1)).toBe(true);
    expect(limiter.allow(1)).toBe(true);
    expect(limiter.allow(1)).toBe(false); // 4th hit blocked
  });

  it('isolates chats from each other', () => {
    const limiter = new RateLimiter(1, 10_000);
    expect(limiter.allow(1)).toBe(true);
    expect(limiter.allow(1)).toBe(false);
    expect(limiter.allow(2)).toBe(true);
  });

  it('releases capacity after the window elapses', () => {
    vi.useFakeTimers();
    try {
      const limiter = new RateLimiter(1, 1_000);
      expect(limiter.allow(1)).toBe(true);
      expect(limiter.allow(1)).toBe(false);
      vi.advanceTimersByTime(1_100);
      expect(limiter.allow(1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('prune drops idle chats', () => {
    vi.useFakeTimers();
    try {
      const limiter = new RateLimiter(5, 1_000);
      limiter.allow(1);
      limiter.allow(2);
      vi.advanceTimersByTime(5_000);
      limiter.prune();
      vi.advanceTimersByTime(5_000);
      // After prune, a previously-blocked chat gets a fresh window.
      expect(limiter.allow(1)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
