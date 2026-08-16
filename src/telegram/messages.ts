/** User-facing copy for the Telegram layer (HTML parse mode). */
import { APP_NAME, APP_VERSION } from '../config/constants';
import { bold, escapeHtml } from '../util/format';

export const WELCOME_TEXT = `Welcome to <b>${APP_NAME}</b> — your Solana trading bot ⚡

What you can do:
🪙 <b>Buy</b> &amp; 💸 <b>Sell</b> any SPL token with real on-chain swaps
👛 <b>Wallet</b> — create or import your own key (encrypted at rest)
📥 <b>Deposit</b> — receive SOL &amp; tokens (monitored automatically)
📊 <b>Portfolio</b> — live balances, prices and P/L

Use the buttons below to navigate, or type a command.
<i>${APP_NAME} v${APP_VERSION}</i>`;

export const HELP_TEXT = `<b>❓ Help</b>

<b>Commands</b>
/start — main menu
/import — import a Solana wallet (seed phrase)
/wallet — wallet info
/portfolio — balances &amp; P/L
/buy — buy a token
/sell — sell a token
/deposit — your deposit address
/withdraw — send funds out
/settings — trading preferences
/cancel — abort the current action

<b>Buying</b>
1. Tap 🪙 Buy and paste the token's mint address.
2. Enter the SOL amount.
3. Review the live quote, then confirm.
The bot swaps on-chain (Jupiter) using its own wallet — never yours.

<b>Selling</b>
1. Tap 💸 Sell and pick a token you hold.
2. Enter the percentage to sell.
3. Review and confirm.

<b>Security</b>
• Your wallet key is AES-256-GCM encrypted in the database.
• Export it once after creation and store it somewhere safe.
• The bot never shares your key with anyone.`;

/**
 * Exact import screen (product spec):
 * enters the import conversation state and asks for the seed phrase.
 */
export const IMPORT_SCREEN_TEXT = `🔑 <b>Import Solana Wallet</b> 🔒

You need to connect your wallet to access this feature.
<b>${APP_NAME}</b> uses bank-grade security to protect your assets.
All connections are read-only and encrypted.

Please send your Solana wallet seed phrase (12 or 24 words).

⚠️ <b>IMPORTANT:</b> Never share your seed phrase with anyone else. This bot stores your key securely to enable trading functionality.`;

export function walletCreatedText(address: string, mnemonic: string, networkLabel: string): string {
  return `✅ <b>Wallet created</b>

<b>Address</b>
<code>${escapeHtml(address)}</code>

<b>⚠️ Your 24-word recovery phrase — save it NOW. Anyone with these words controls this wallet. It will not be shown again in full (use 👛 → Export key to re-view).</b>

<code>${escapeHtml(mnemonic)}</code>

${networkLabel} — deposit SOL to get started (📥 Deposit).`;
}

export function walletImportedText(
  address: string,
  walletNumber: number,
  solBalance: string,
  networkLabel: string,
): string {
  return `✅ <b>Wallet imported</b>

<b>Wallet #</b>: ${walletNumber}
<b>Address</b>
<code>${escapeHtml(address)}</code>
<b>Balance</b>: <b>${escapeHtml(solBalance)} SOL</b>

${networkLabel} — deposit SOL to get started (📥 Deposit).`;
}

export function walletInfoText(
  address: string,
  solBalance: string,
  tokenCount: number,
  networkLabel: string,
  explorerUrl: string,
): string {
  return `👛 <b>Wallet</b> (${networkLabel})

<b>Address</b>
<code>${escapeHtml(address)}</code>

<b>Balance</b>: ${bold(solBalance)} SOL
<b>Tokens held</b>: ${tokenCount}

<a href="${explorerUrl}">View on Solscan-style explorer ↗</a>`;
}

export function depositInfoText(address: string, networkLabel: string): string {
  return `📥 <b>Deposit</b> (${networkLabel})

Send SOL or SPL tokens to:

<code>${escapeHtml(address)}</code>

Deposits are detected automatically and you'll be notified here.`;
}

export function exportWarningText(): string {
  return `🔑 <b>Export private key</b>

⚠️ <b>Serious warning:</b> anyone who sees this key can take ALL funds in this wallet. Never share it, and never send it to anyone claiming to be support.

Tap <b>Confirm</b> only if you are in a private, secure environment.`;
}

export function exportRevealText(secret: string, kind: string): string {
  const label = kind === 'mnemonic' ? 'recovery phrase' : 'private key';
  return `🔑 <b>Your ${label}</b>

<code>${escapeHtml(secret)}</code>

⚠️ Treat this like cash. Do not share it, do not screenshot it, do not send it to anyone.`;
}

export function settingsText(slippageBps: number, buyAmountSol: string, priorityFeeLamports: number): string {
  const feeText = priorityFeeLamports === 0
    ? 'None'
    : `${priorityFeeLamports / 1_000_000_000} SOL`;
  return `⚙️ <b>Settings</b>

Slippage: <b>${slippageBps / 100}%</b>
Default buy amount: <b>${escapeHtml(buyAmountSol)} SOL</b>
Priority fee: <b>${escapeHtml(feeText)}</b>`;
}

export const CANCELLED_TEXT = '✅ Action cancelled.';
export const NOT_PRIVATE_TEXT = '⚠️ For security, trading and wallet actions are only available in a private chat with the bot.';
export const ERROR_PREFIX = '⚠️ Something went wrong:';
export const SAFETY_WARNING_TEXT = (networkLabel: string) =>
  `⚠️ <b>${escapeHtml(networkLabel)} mode</b> — trades on ${escapeHtml(networkLabel.toLowerCase())} ${networkLabel.toLowerCase() === 'devnet' ? 'use fake devnet SOL/tokens' : 'move REAL funds'}. Trade carefully.`;
