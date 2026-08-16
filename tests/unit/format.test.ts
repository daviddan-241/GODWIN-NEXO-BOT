/** Formatting helper tests. */
import { describe, it, expect } from 'vitest';
import {
  lamportsToSol,
  solToLamports,
  formatTokenAmount,
  formatUsd,
  shortAddress,
  escapeHtml,
  bpsToPct,
  truncate,
} from '../../src/util/format';

describe('util/format', () => {
  it('converts lamports to SOL strings', () => {
    expect(lamportsToSol(1_000_000_000n)).toBe('1');
    expect(lamportsToSol(1_500_000_000n)).toBe('1.5');
    expect(lamportsToSol(1_234_567_890n)).toBe('1.23456789');
    expect(lamportsToSol(1n)).toBe('0.000000001');
    expect(lamportsToSol(0n)).toBe('0');
    expect(lamportsToSol(-500_000_000n)).toBe('-0.5');
  });

  it('parses SOL strings into lamports', () => {
    expect(solToLamports('1')).toBe(1_000_000_000n);
    expect(solToLamports('0.5')).toBe(500_000_000n);
    expect(solToLamports('1.23456789')).toBe(1_234_567_890n);
    expect(() => solToLamports('1.2345678901')).toThrow(); // > 9 decimals
    expect(() => solToLamports('abc')).toThrow();
    expect(() => solToLamports('-1')).toThrow();
  });

  it('formats raw token amounts with decimals', () => {
    expect(formatTokenAmount('15000000', 6)).toBe('15');
    expect(formatTokenAmount('15000001', 6)).toBe('15.000001');
    expect(formatTokenAmount('123456789012', 9)).toBe('123.456789012');
    expect(formatTokenAmount('0', 6)).toBe('0');
  });

  it('formats USD values', () => {
    expect(formatUsd(1234.5)).toContain('1,234.50');
    expect(formatUsd(null)).toBe('n/a');
  });

  it('shortens addresses', () => {
    expect(shortAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe('EPjFWd…Dt1v');
  });

  it('escapes HTML for Telegram messages', () => {
    expect(escapeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('formats bps as percent', () => {
    expect(bpsToPct(100)).toBe('1%');
    expect(bpsToPct(50)).toBe('0.5%');
    expect(bpsToPct(250)).toBe('2.5%');
  });

  it('truncates long strings', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…');
    expect(truncate('abc', 5)).toBe('abc');
  });
});
