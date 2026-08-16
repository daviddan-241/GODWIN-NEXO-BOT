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
  /**
   * Positive deltas awaiting confirmation: a deposit is recorded and
   * notified only after the delta persists across N consecutive polls
   * (DEPOSIT_CONFIRMATION_POLLS) at the configured RPC commitment, to
   * avoid false positives from reorgs/rollbacks.
   */
  private pending = new Map<string, { mint: string; amount: string; polls: number }>();

  /**
   * Called when a deposit is detected so the USER can be notified
   * (DEPOSIT RECEIVED). Wired to the Telegram API after bot construction.
   */
  onUserDeposit:
    | ((chatId: number, address: string, amountSol: number, newBalanceSol: number) => Promise<void>)
    | null = null;

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
      const wallets = (await this.repos.allWallets()).filter((w) => w.active !== false);
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

    const prev = await this.repos.getSnapshots(chatId, address);
    const firstRun = Object.keys(prev).length === 0;

    const requiredPolls = this.config.DEPOSIT_CONFIRMATION_POLLS;
    const diffs = diffSnapshots(prev, curr);
    let skipSnapshotSave = false; // true while any delta awaits confirmation

    for (const diff of diffs) {
      const key = `${chatId}|${address}|${diff.mint}`;
      const pending = this.pending.get(key);

      if (diff.delta > 0n) {
        if (diff.delta < BigInt(DEPOSIT_DUST_LAMPORTS)) continue; // ignore dust
        if (firstRun) continue; // baseline only — never a deposit

        if (pending && BigInt(pending.amount) <= diff.delta) {
          const polls = pending.polls + 1;
          if (polls >= requiredPolls) {
            // CONFIRMED: the delta persisted across the required polls.
            this.pending.delete(key);
            await this.recordDeposit(chatId, address, diff, curr);
          } else {
            pending.polls = polls;
            skipSnapshotSave = true;
          }
        } else if (pending && BigInt(pending.amount) > diff.delta) {
          // Shrank since the last poll — reorg/partial: restart counting.
          pending.amount = diff.delta.toString();
          pending.polls = 1;
          skipSnapshotSave = true;
        } else {
          this.pending.set(key, { mint: diff.mint, amount: diff.delta.toString(), polls: 1 });
          skipSnapshotSave = true;
        }
      } else if (pending) {
        // Outflow cancels any pending inflow confirmation.
        this.pending.delete(key);
      }
    }

    if (!skipSnapshotSave) {
      await this.repos.saveSnapshots(chatId, address, curr);
    }
    await this.repos.updateWalletMeta(chatId, address, { touchBalanceCheck: true });
  }

  private async recordDeposit(
    chatId: number,
    address: string,
    diff: BalanceDiff,
    curr: Record<string, string>,
  ): Promise<void> {
    const display = diff.mint === WSOL_MINT
      ? `${lamportsToSol(diff.delta)} SOL`
      : `${formatTokenAmount(diff.delta.toString(), await this.decimalsOf(diff.mint))} tokens`;
    await this.repos.insertDeposit({
      chatId,
      mint: diff.mint,
      amount: diff.delta.toString(),
    });
    this.logger.info({ chatId, mint: diff.mint, amount: diff.delta.toString() }, 'deposit confirmed');

    // Best-effort enrichment: latest tx signature + sender + current slot.
    const meta = await this.findDepositMeta(address);
    const slot = await this.solana.getSlot().catch(() => null);

    await this.notifier.event('deposit', {
      wallet: address,
      sender: meta.sender ?? 'unknown',
      amount: display,
      token: diff.mint === WSOL_MINT ? 'SOL' : shortAddress(diff.mint),
      signature: meta.signature ?? 'n/a',
      slot: slot !== null ? String(slot) : 'n/a',
      user: chatId,
    });

    if (diff.mint === WSOL_MINT) {
      await this.onUserDeposit?.(
        chatId,
        address,
        Number(diff.delta) / 1e9,
        Number(curr[WSOL_MINT]) / 1e9,
      );
    }
  }

  /**
   * Best-effort lookup of the most recent successful transaction for the
   * wallet and its sender. Failures degrade to nulls — deposits are still
   * recorded without tx metadata.
   */
  private async findDepositMeta(address: string): Promise<{ signature: string | null; sender: string | null }> {
    try {
      const recent = await this.solana.getRecentSignatures(address, 5);
      const first = recent.find((r) => r.err === null);
      if (!first) return { signature: null, sender: null };
      const sender = await this.solana.getTransactionSender(first.signature, address).catch(() => null);
      return { signature: first.signature, sender };
    } catch (err) {
      this.logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'deposit meta lookup failed');
      return { signature: null, sender: null };
    }
  }

  /** Re-snapshots ALL of a user's wallets immediately (after trades/wallet ops). */
  async rebaseline(chatId: number): Promise<void> {
    const wallets = await this.repos.getWallets(chatId);
    for (const wallet of wallets) {
      try {
        const solBalance = await this.solana.getBalance(wallet.address);
        const accounts = await this.solana.getParsedTokenAccountsByOwner(wallet.address);
        const curr: Record<string, string> = {
          [WSOL_MINT]: String(solBalance),
          ...Object.fromEntries(accounts.map((a) => [a.mint, a.amount])),
        };
        await this.repos.saveSnapshots(chatId, wallet.address, curr);
      } catch (err) {
        this.logger.warn(
          { chatId, address: wallet.address, err: err instanceof Error ? err.message : String(err) },
          'rebaseline failed',
        );
      }
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
