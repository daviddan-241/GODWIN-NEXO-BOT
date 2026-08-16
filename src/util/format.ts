/** Formatting helpers for amounts, addresses and Telegram-safe text. */
import { LAMPORTS_PER_SOL } from '../config/constants';

export function lamportsToSol(lamports: bigint | number | string): string {
  const lamportsBig = BigInt(lamports);
  const sign = lamportsBig < 0n ? '-' : '';
  const abs = lamportsBig < 0n ? -lamportsBig : lamportsBig;
  const whole = abs / BigInt(LAMPORTS_PER_SOL);
  const frac = abs % BigInt(LAMPORTS_PER_SOL);
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${fracStr ? '.' + fracStr : ''}`;
}

export function solToLamports(sol: string): bigint {
  if (!/^\d+(\.\d{1,9})?$/.test(sol)) {
    throw new Error(`Invalid SOL amount: "${sol}"`);
  }
  const [whole, frac = ''] = sol.split('.');
  return BigInt(whole) * BigInt(LAMPORTS_PER_SOL) + BigInt(frac.padEnd(9, '0') || '0');
}

/** Formats a raw token amount (string, in base units) using the mint's decimals. */
export function formatTokenAmount(rawAmount: string, decimals: number): string {
  const raw = BigInt(rawAmount);
  const sign = raw < 0n ? '-' : '';
  const abs = raw < 0n ? -raw : raw;
  if (decimals <= 0) return `${sign}${abs.toString()}`;
  const div = 10n ** BigInt(decimals);
  const whole = abs / div;
  const frac = (abs % div).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}${frac ? '.' + frac : ''}`;
}

export function formatUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function shortSignature(signature: string): string {
  return shortAddress(signature, 8, 8);
}

export function explorerTxUrl(signature: string, isDevnet: boolean): string {
  const suffix = isDevnet ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${signature}${suffix}`;
}

export function explorerAddressUrl(address: string, isDevnet: boolean): string {
  const suffix = isDevnet ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/address/${address}${suffix}`;
}

/** Escapes user-provided text before it is placed into HTML parse-mode messages. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Telegram-safe inline code (monospace) with HTML escaping. */
export function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

export function bold(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

export function formatPct(pct: number, digits = 2): string {
  return `${pct.toFixed(digits)}%`;
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

/** Truncates a string to `max` chars with ellipsis (for log lines). */
export function truncate(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
