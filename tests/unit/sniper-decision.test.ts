/** AI Sniper decision logic tests (pure functions). */
import { describe, it, expect } from 'vitest';
import { shouldSnipe, tpSlDecision } from '../../src/sniper/engine';

describe('sniper/shouldSnipe', () => {
  const now = Date.now();

  it('snipes new tokens when anti-rug is OFF', () => {
    expect(shouldSnipe({ created_at: now - 2_000 }, false, null, 120, now)).toEqual({ ok: true });
  });

  it('blocks tokens younger than the minimum age when anti-rug is ON', () => {
    const decision = shouldSnipe({ created_at: now - 30_000 }, true, { liquidity: 1000 }, 120, now);
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('anti-rug is ON');
  });

  it('blocks tokens with no liquidity when anti-rug is ON', () => {
    const decision = shouldSnipe({ created_at: now - 300_000 }, true, { liquidity: 0 }, 120, now);
    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('no real liquidity');
  });

  it('snipes older tokens with real liquidity when anti-rug is ON', () => {
    expect(shouldSnipe({ created_at: now - 300_000 }, true, { liquidity: 5000 }, 120, now)).toEqual({ ok: true });
  });

  it('snipes when the age is unknown (no created_at)', () => {
    expect(shouldSnipe({}, true, { liquidity: 5000 }, 120, now)).toEqual({ ok: true });
  });
});

describe('sniper/tpSlDecision', () => {
  it('holds inside the TP/SL band', () => {
    expect(tpSlDecision(1.0, 1.5, 100, 30)).toEqual({ action: 'hold' });
    expect(tpSlDecision(1.0, 0.9, 100, 30)).toEqual({ action: 'hold' });
  });

  it('triggers take profit at the threshold', () => {
    const d = tpSlDecision(1.0, 2.0, 100, 30);
    expect(d.action).toBe('take_profit');
    if (d.action === 'take_profit') expect(d.pnlPct).toBeCloseTo(100);
  });

  it('triggers stop loss at the threshold', () => {
    const d = tpSlDecision(1.0, 0.7, 100, 30);
    expect(d.action).toBe('stop_loss');
    if (d.action === 'stop_loss') expect(d.pnlPct).toBeCloseTo(-30);
  });

  it('holds when prices are missing', () => {
    expect(tpSlDecision(0, 1.5, 100, 30)).toEqual({ action: 'hold' });
    expect(tpSlDecision(1.0, 0, 100, 30)).toEqual({ action: 'hold' });
  });
});
