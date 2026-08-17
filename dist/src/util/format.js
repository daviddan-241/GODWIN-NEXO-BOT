"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lamportsToSol = lamportsToSol;
exports.solToLamports = solToLamports;
exports.formatTokenAmount = formatTokenAmount;
exports.formatUsd = formatUsd;
exports.shortAddress = shortAddress;
exports.shortSignature = shortSignature;
exports.explorerTxUrl = explorerTxUrl;
exports.explorerAddressUrl = explorerAddressUrl;
exports.escapeHtml = escapeHtml;
exports.code = code;
exports.bold = bold;
exports.formatPct = formatPct;
exports.bpsToPct = bpsToPct;
exports.truncate = truncate;
/** Formatting helpers for amounts, addresses and Telegram-safe text. */
const constants_1 = require("../config/constants");
function lamportsToSol(lamports) {
    const lamportsBig = BigInt(lamports);
    const sign = lamportsBig < 0n ? '-' : '';
    const abs = lamportsBig < 0n ? -lamportsBig : lamportsBig;
    const whole = abs / BigInt(constants_1.LAMPORTS_PER_SOL);
    const frac = abs % BigInt(constants_1.LAMPORTS_PER_SOL);
    const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
    return `${sign}${whole.toString()}${fracStr ? '.' + fracStr : ''}`;
}
function solToLamports(sol) {
    if (!/^\d+(\.\d{1,9})?$/.test(sol)) {
        throw new Error(`Invalid SOL amount: "${sol}"`);
    }
    const [whole, frac = ''] = sol.split('.');
    return BigInt(whole) * BigInt(constants_1.LAMPORTS_PER_SOL) + BigInt(frac.padEnd(9, '0') || '0');
}
/** Formats a raw token amount (string, in base units) using the mint's decimals. */
function formatTokenAmount(rawAmount, decimals) {
    const raw = BigInt(rawAmount);
    const sign = raw < 0n ? '-' : '';
    const abs = raw < 0n ? -raw : raw;
    if (decimals <= 0)
        return `${sign}${abs.toString()}`;
    const div = 10n ** BigInt(decimals);
    const whole = abs / div;
    const frac = (abs % div).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${sign}${whole.toString()}${frac ? '.' + frac : ''}`;
}
function formatUsd(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(value))
        return 'n/a';
    return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}`;
}
function shortAddress(address, head = 6, tail = 4) {
    if (address.length <= head + tail + 3)
        return address;
    return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
function shortSignature(signature) {
    return shortAddress(signature, 8, 8);
}
function explorerTxUrl(signature, isDevnet) {
    const suffix = isDevnet ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${signature}${suffix}`;
}
function explorerAddressUrl(address, isDevnet) {
    const suffix = isDevnet ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/address/${address}${suffix}`;
}
/** Escapes user-provided text before it is placed into HTML parse-mode messages. */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
/** Telegram-safe inline code (monospace) with HTML escaping. */
function code(text) {
    return `<code>${escapeHtml(text)}</code>`;
}
function bold(text) {
    return `<b>${escapeHtml(text)}</b>`;
}
function formatPct(pct, digits = 2) {
    return `${pct.toFixed(digits)}%`;
}
function bpsToPct(bps) {
    return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}
/** Truncates a string to `max` chars with ellipsis (for log lines). */
function truncate(text, max = 120) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}
//# sourceMappingURL=format.js.map