/**
 * Optional Solana WebSocket account watcher.
 *
 * When SOLANA_WS_URL is configured, the deposit monitor can react to
 * account-change notifications IMMEDIATELY instead of waiting for the next
 * poll. The watcher only triggers a balance re-check — all deposit
 * detection, confirmation counting and notification logic still lives in
 * DepositMonitor (poll-based, authoritative). If the WebSocket drops,
 * polling still covers deposits; subscriptions are reconciled every 30s.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import type { Commitment, Finality } from '@solana/web3.js';
import type { Logger } from '../logging/logger';

export class SolanaAccountWatcher {
  private connection: Connection | null = null;
  private subscriptions = new Map<string, number>();
  private debounces = new Map<string, NodeJS.Timeout>();
  private addresses = new Set<string>();
  private stopped = true;

  constructor(
    private rpcUrl: string,
    private wsUrl: string,
    private commitment: Commitment,
    private logger: Logger,
    private onActivity: (address: string) => void,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.logger.info({ wsUrl: this.wsUrl }, 'solana websocket watcher started');
  }

  private connect(): void {
    try {
      this.connection = new Connection(this.rpcUrl, {
        wsEndpoint: this.wsUrl,
        commitment: this.commitment,
      });
      for (const address of this.addresses) this.subscribeOne(address);
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'websocket connect failed (polling still active)',
      );
    }
  }

  /** Reconciles subscriptions with the given (active) wallet set. */
  async setAddresses(addresses: string[]): Promise<void> {
    this.addresses = new Set(addresses);
    if (this.stopped) return;
    if (!this.connection) {
      this.connect();
      return;
    }

    for (const [address, id] of this.subscriptions) {
      if (!this.addresses.has(address)) {
        try {
          await this.connection.removeAccountChangeListener(id);
        } catch {
          // already gone
        }
        this.subscriptions.delete(address);
      }
    }
    for (const address of addresses) this.subscribeOne(address);
  }

  private subscribeOne(address: string): void {
    if (!this.connection || this.subscriptions.has(address)) return;
    try {
      const id = this.connection.onAccountChange(
        new PublicKey(address),
        () => {
          const existing = this.debounces.get(address);
          if (existing) clearTimeout(existing);
          this.debounces.set(
            address,
            setTimeout(() => {
              this.debounces.delete(address);
              this.onActivity(address);
            }, 2_000),
          );
        },
        this.commitment as Finality,
      );
      this.subscriptions.set(address, id);
    } catch (err) {
      this.logger.warn(
        { address, err: err instanceof Error ? err.message : String(err) },
        'websocket subscribe failed',
      );
    }
  }

  stop(): void {
    this.stopped = true;
    for (const [address, id] of this.subscriptions) {
      try {
        void this.connection?.removeAccountChangeListener(id).catch(() => undefined);
      } catch {
        // ignore
      }
      void address;
    }
    this.subscriptions.clear();
    for (const t of this.debounces.values()) clearTimeout(t);
    this.debounces.clear();
    this.connection = null;
    this.logger.info('solana websocket watcher stopped');
  }
}
