/**
 * Deposit monitoring: balance snapshots + diffs + polling loop.
 *
 * The monitor snapshots the on-chain balances of every bot wallet
 * (native SOL + all SPL token accounts) and compares them against the
 * previous snapshot. Positive deltas are recorded as deposits and trigger
 * admin/user notifications. Trades and withdrawals call `rebaseline()` so
 * their own balance changes are not misclassified.
 */
import type { Logger } from '../logging/logger';
import type { AppConfig } from '../config/env';
import type { Repos } from '../db/repos';
import type { SolanaClient } from '../solana/types';
import type { AdminNotifier } from '../admin/notifier';
import { WSOL_MINT, DEPOSIT_DUST_LAMPORTS } from '../config/constants';
import { sleep } from '../util/retry';
import { formatTokenAmount, lamportsToSol, shortAddress } from '../util/format';

export interface BalanceDiff {
  mint: string;
  delta: bigint; // positive = inflow (deposit), negative = outflow
}

/** Pure diff logic — unit-tested without any I/O. */
export function diffSnapshots(
  prev: Record<string, string>,
  curr: Record<string, string>,
): BalanceDiff[] {
  const mints = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const diffs: BalanceDiff[] = [];
  for (const mint of mints) {
    const before = BigInt(prev[mint] ?? '0');
    const after = BigInt(curr[mint] ?? '0');
    const delta = after - before;
    if (delta !== 0n) diffs.push({ mint, delta });
  }
  return diffs;
}

export class DepositMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private config: AppConfig,
    private repos: Repos,
    private solana: SolanaClient,
    private notifier: AdminNotifier,
    private logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.logger.info(
      { intervalMs: this.config.DEPOSIT_POLL_INTERVAL_MS },
      'deposit monitor started',
    );
    void this.pollLoop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.info('deposit monitor stopped');
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.pollOnce();
      } catch (err) {
        this.logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'deposit poll failed (will retry)',
        );
      }
      await sleep(this.config.DEPOSIT_POLL_INTERVAL_MS);
    }
  }

  async pollOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const wallets = await this.repos.allWallets();
      for (const wallet of wallets) {
        try {
          await this.checkWallet(wallet.chatId, wallet.address);
        } catch (err) {
          this.logger.warn(
            { chatId: wallet.chatId, err: err instanceof Error ? err.message : String(err) },
            'deposit check failed for wallet',
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async checkWallet(chatId: number, address: string): Promise<void> {
    const solBalance = await this.solana.getBalance(address);
    const accounts = await this.solana.getParsedTokenAccountsByOwner(address);

    const curr: Record<string, string> = {
      [WSOL_MINT]: String(solBalance),
      ...Object.fromEntries(accounts.map((a) => [a.mint, a.amount])),
    };

    const prev = await this.repos.getSnapshots(chatId);
    const firstRun = Object.keys(prev).length === 0;

    const diffs = diffSnapshots(prev, curr);
    for (const diff of diffs) {
      if (diff.delta > 0n) {
        if (diff.delta < BigInt(DEPOSIT_DUST_LAMPORTS)) continue; // ignore dust
        if (firstRun) {
          // No reliable baseline yet: the initial balance cannot be
          // attributed to a fresh deposit, so record nothing (wallets are
          // re-baselined at creation, so this only affects pre-existing
          // wallets seen for the first time).
          continue;
        }
        const display = diff.mint === WSOL_MINT
          ? `${lamportsToSol(diff.delta)} SOL`
          : `${formatTokenAmount(diff.delta.toString(), await this.decimalsOf(diff.mint))} tokens`;
        await this.repos.insertDeposit({
          chatId,
          mint: diff.mint,
          amount: diff.delta.toString(),
        });
        this.logger.info(
          { chatId, mint: diff.mint, amount: diff.delta.toString() },
          'deposit detected',
        );
        await this.notifier.send(
          `💰 <b>Deposit detected</b>\n` +
            `User: <code>${chatId}</code>\n` +
            `Amount: ${display}\n` +
            `Token: <code>${shortAddress(diff.mint)}</code>\n` +
            `Wallet: <code>${shortAddress(address)}</code>`,
        );
      } else {
        // Outflow — normal wallet activity (trades/withdrawals are
        // re-baselined, so this is informational only).
        this.logger.debug({ chatId, mint: diff.mint, delta: diff.delta.toString() }, 'balance outflow');
      }
    }

    await this.repos.saveSnapshots(chatId, curr);
  }

  /** Re-snapshots a wallet immediately (after trades/withdrawals). */
  async rebaseline(chatId: number): Promise<void> {
    const wallet = await this.repos.getWallet(chatId);
    if (!wallet) return;
    try {
      const solBalance = await this.solana.getBalance(wallet.address);
      const accounts = await this.solana.getParsedTokenAccountsByOwner(wallet.address);
      const curr: Record<string, string> = {
        [WSOL_MINT]: String(solBalance),
        ...Object.fromEntries(accounts.map((a) => [a.mint, a.amount])),
      };
      await this.repos.saveSnapshots(chatId, curr);
    } catch (err) {
      this.logger.warn(
        { chatId, err: err instanceof Error ? err.message : String(err) },
        'rebaseline failed',
      );
    }
  }

  private async decimalsOf(mint: string): Promise<number> {
    try {
      if (mint === WSOL_MINT) return 9;
      const info = await this.solana.getMintInfo(mint);
      return info.decimals;
    } catch {
      return 9;
    }
  }
}
