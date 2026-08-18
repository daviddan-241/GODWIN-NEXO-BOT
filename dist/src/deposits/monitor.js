"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositMonitor = void 0;
exports.diffSnapshots = diffSnapshots;
const constants_1 = require("../config/constants");
const retry_1 = require("../util/retry");
const format_1 = require("../util/format");
/** Pure diff logic — unit-tested without any I/O. */
function diffSnapshots(prev, curr) {
    const mints = new Set([...Object.keys(prev), ...Object.keys(curr)]);
    const diffs = [];
    for (const mint of mints) {
        const before = BigInt(prev[mint] ?? '0');
        const after = BigInt(curr[mint] ?? '0');
        const delta = after - before;
        if (delta !== 0n)
            diffs.push({ mint, delta });
    }
    return diffs;
}
class DepositMonitor {
    config;
    repos;
    solana;
    notifier;
    logger;
    timer = null;
    running = false;
    stopped = false;
    /**
     * Positive deltas awaiting confirmation: a deposit is recorded and
     * notified only after the delta persists across N consecutive polls
     * (DEPOSIT_CONFIRMATION_POLLS) at the configured RPC commitment, to
     * avoid false positives from reorgs/rollbacks.
     */
    pending = new Map();
    /**
     * Called when a deposit is detected so the USER can be notified
     * (DEPOSIT RECEIVED). Wired to the Telegram API after bot construction.
     */
    onUserDeposit = null;
    constructor(config, repos, solana, notifier, logger) {
        this.config = config;
        this.repos = repos;
        this.solana = solana;
        this.notifier = notifier;
        this.logger = logger;
    }
    start() {
        if (this.timer)
            return;
        this.stopped = false;
        this.logger.info({ intervalMs: this.config.DEPOSIT_POLL_INTERVAL_MS }, 'deposit monitor started');
        void this.pollLoop();
    }
    stop() {
        this.stopped = true;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.logger.info('deposit monitor stopped');
    }
    async pollLoop() {
        while (!this.stopped) {
            try {
                await this.pollOnce();
            }
            catch (err) {
                this.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'deposit poll failed (will retry)');
            }
            await (0, retry_1.sleep)(this.config.DEPOSIT_POLL_INTERVAL_MS);
        }
    }
    async pollOnce() {
        if (this.running)
            return;
        this.running = true;
        try {
            const wallets = (await this.repos.allWallets()).filter((w) => w.active !== false);
            for (const wallet of wallets) {
                try {
                    await this.checkWallet(wallet.chatId, wallet.address);
                }
                catch (err) {
                    this.logger.warn({ chatId: wallet.chatId, err: err instanceof Error ? err.message : String(err) }, 'deposit check failed for wallet');
                }
            }
        }
        finally {
            this.running = false;
        }
    }
    async checkWallet(chatId, address) {
        const solBalance = await this.solana.getBalance(address);
        const accounts = await this.solana.getParsedTokenAccountsByOwner(address);
        const curr = {
            [constants_1.WSOL_MINT]: String(solBalance),
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
                if (diff.delta < BigInt(constants_1.DEPOSIT_DUST_LAMPORTS))
                    continue; // ignore dust
                if (firstRun)
                    continue; // baseline only — never a deposit
                if (pending && BigInt(pending.amount) <= diff.delta) {
                    const polls = pending.polls + 1;
                    if (polls >= requiredPolls) {
                        // CONFIRMED: the delta persisted across the required polls.
                        this.pending.delete(key);
                        await this.recordDeposit(chatId, address, diff, curr);
                    }
                    else {
                        pending.polls = polls;
                        skipSnapshotSave = true;
                    }
                }
                else if (pending && BigInt(pending.amount) > diff.delta) {
                    // Shrank since the last poll — reorg/partial: restart counting.
                    pending.amount = diff.delta.toString();
                    pending.polls = 1;
                    skipSnapshotSave = true;
                }
                else {
                    this.pending.set(key, { mint: diff.mint, amount: diff.delta.toString(), polls: 1 });
                    skipSnapshotSave = true;
                }
            }
            else if (pending) {
                // Outflow cancels any pending inflow confirmation.
                this.pending.delete(key);
            }
        }
        if (!skipSnapshotSave) {
            await this.repos.saveSnapshots(chatId, address, curr);
        }
        await this.repos.updateWalletMeta(chatId, address, { touchBalanceCheck: true });
    }
    async recordDeposit(chatId, address, diff, curr) {
        const display = diff.mint === constants_1.WSOL_MINT
            ? `${(0, format_1.lamportsToSol)(diff.delta)} SOL`
            : `${(0, format_1.formatTokenAmount)(diff.delta.toString(), await this.decimalsOf(diff.mint))} tokens`;
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
            token: diff.mint === constants_1.WSOL_MINT ? 'SOL' : (0, format_1.shortAddress)(diff.mint),
            signature: meta.signature ?? 'n/a',
            slot: slot !== null ? String(slot) : 'n/a',
            user: chatId,
        });
        if (diff.mint === constants_1.WSOL_MINT) {
            await this.onUserDeposit?.(chatId, address, Number(diff.delta) / 1e9, Number(curr[constants_1.WSOL_MINT]) / 1e9, meta.signature);
        }
    }
    /**
     * Best-effort lookup of the most recent successful transaction for the
     * wallet and its sender. Failures degrade to nulls — deposits are still
     * recorded without tx metadata.
     */
    async findDepositMeta(address) {
        try {
            const recent = await this.solana.getRecentSignatures(address, 5);
            const first = recent.find((r) => r.err === null);
            if (!first)
                return { signature: null, sender: null };
            const sender = await this.solana.getTransactionSender(first.signature, address).catch(() => null);
            return { signature: first.signature, sender };
        }
        catch (err) {
            this.logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'deposit meta lookup failed');
            return { signature: null, sender: null };
        }
    }
    /** Re-snapshots ALL of a user's wallets immediately (after trades/wallet ops). */
    async rebaseline(chatId) {
        const wallets = await this.repos.getWallets(chatId);
        for (const wallet of wallets) {
            try {
                const solBalance = await this.solana.getBalance(wallet.address);
                const accounts = await this.solana.getParsedTokenAccountsByOwner(wallet.address);
                const curr = {
                    [constants_1.WSOL_MINT]: String(solBalance),
                    ...Object.fromEntries(accounts.map((a) => [a.mint, a.amount])),
                };
                await this.repos.saveSnapshots(chatId, wallet.address, curr);
            }
            catch (err) {
                this.logger.warn({ chatId, address: wallet.address, err: err instanceof Error ? err.message : String(err) }, 'rebaseline failed');
            }
        }
    }
    async decimalsOf(mint) {
        try {
            if (mint === constants_1.WSOL_MINT)
                return 9;
            const info = await this.solana.getMintInfo(mint);
            return info.decimals;
        }
        catch {
            return 9;
        }
    }
}
exports.DepositMonitor = DepositMonitor;
//# sourceMappingURL=monitor.js.map