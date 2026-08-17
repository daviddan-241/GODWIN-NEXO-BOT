"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaAccountWatcher = void 0;
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
const web3_js_1 = require("@solana/web3.js");
class SolanaAccountWatcher {
    rpcUrl;
    wsUrl;
    commitment;
    logger;
    onActivity;
    connection = null;
    subscriptions = new Map();
    debounces = new Map();
    addresses = new Set();
    stopped = true;
    constructor(rpcUrl, wsUrl, commitment, logger, onActivity) {
        this.rpcUrl = rpcUrl;
        this.wsUrl = wsUrl;
        this.commitment = commitment;
        this.logger = logger;
        this.onActivity = onActivity;
    }
    start() {
        if (!this.stopped)
            return;
        this.stopped = false;
        this.connect();
        this.logger.info({ wsUrl: this.wsUrl }, 'solana websocket watcher started');
    }
    connect() {
        try {
            this.connection = new web3_js_1.Connection(this.rpcUrl, {
                wsEndpoint: this.wsUrl,
                commitment: this.commitment,
            });
            for (const address of this.addresses)
                this.subscribeOne(address);
        }
        catch (err) {
            this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'websocket connect failed (polling still active)');
        }
    }
    /** Reconciles subscriptions with the given (active) wallet set. */
    async setAddresses(addresses) {
        this.addresses = new Set(addresses);
        if (this.stopped)
            return;
        if (!this.connection) {
            this.connect();
            return;
        }
        for (const [address, id] of this.subscriptions) {
            if (!this.addresses.has(address)) {
                try {
                    await this.connection.removeAccountChangeListener(id);
                }
                catch {
                    // already gone
                }
                this.subscriptions.delete(address);
            }
        }
        for (const address of addresses)
            this.subscribeOne(address);
    }
    subscribeOne(address) {
        if (!this.connection || this.subscriptions.has(address))
            return;
        try {
            const id = this.connection.onAccountChange(new web3_js_1.PublicKey(address), () => {
                const existing = this.debounces.get(address);
                if (existing)
                    clearTimeout(existing);
                this.debounces.set(address, setTimeout(() => {
                    this.debounces.delete(address);
                    this.onActivity(address);
                }, 2_000));
            }, this.commitment);
            this.subscriptions.set(address, id);
        }
        catch (err) {
            this.logger.warn({ address, err: err instanceof Error ? err.message : String(err) }, 'websocket subscribe failed');
        }
    }
    stop() {
        this.stopped = true;
        for (const [address, id] of this.subscriptions) {
            try {
                void this.connection?.removeAccountChangeListener(id).catch(() => undefined);
            }
            catch {
                // ignore
            }
            void address;
        }
        this.subscriptions.clear();
        for (const t of this.debounces.values())
            clearTimeout(t);
        this.debounces.clear();
        this.connection = null;
        this.logger.info('solana websocket watcher stopped');
    }
}
exports.SolanaAccountWatcher = SolanaAccountWatcher;
//# sourceMappingURL=ws-watcher.js.map