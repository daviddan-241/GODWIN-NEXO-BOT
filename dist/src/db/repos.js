"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Repos = void 0;
/**
 * Thin repository layer over drizzle. Keeps SQL in one place and gives the
 * rest of the app plain functions/types to depend on.
 */
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
class Repos {
    db;
    constructor(db) {
        this.db = db;
    }
    // ---- users -----------------------------------------------------------
    async upsertUser(u) {
        await this.db
            .insert(schema_1.users)
            .values({ chatId: u.chatId, username: u.username, firstName: u.firstName })
            .onConflictDoUpdate({
            target: schema_1.users.chatId,
            set: { username: u.username, firstName: u.firstName },
        });
    }
    /** Lightweight existence check (used for "new user" detection). */
    async hasUser(chatId) {
        const rows = await this.db
            .select({ c: (0, drizzle_orm_1.count)() })
            .from(schema_1.users)
            .where((0, drizzle_orm_1.eq)(schema_1.users.chatId, chatId));
        return Number(rows[0]?.c ?? 0) > 0;
    }
    /** Ensures a users row exists (no-op when it already does). */
    async ensureUser(chatId) {
        await this.db
            .insert(schema_1.users)
            .values({ chatId })
            .onConflictDoNothing({ target: schema_1.users.chatId });
    }
    /**
     * Atomically increments the user's wallet counter and returns the new
     * value — used as the wallet number shown to users/admins.
     */
    async nextWalletNumber(chatId) {
        const rows = await this.db
            .update(schema_1.users)
            .set({ walletCounter: (0, drizzle_orm_1.sql) `${schema_1.users.walletCounter} + 1` })
            .where((0, drizzle_orm_1.eq)(schema_1.users.chatId, chatId))
            .returning({ walletCounter: schema_1.users.walletCounter });
        return rows[0]?.walletCounter ?? 1;
    }
    async countUsers() {
        const rows = await this.db.select({ c: (0, drizzle_orm_1.count)() }).from(schema_1.users);
        return Number(rows[0]?.c ?? 0);
    }
    async allUserChatIds() {
        const rows = await this.db.select({ chatId: schema_1.users.chatId }).from(schema_1.users);
        return rows.map((r) => r.chatId);
    }
    // ---- settings --------------------------------------------------------
    async getSettings(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.userSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.userSettings.chatId, chatId))
            .limit(1);
        return rows[0] ?? {
            chatId,
            slippageBps: 100,
            buyAmountSol: '0.1',
            priorityFeeLamports: 0,
        };
    }
    async updateSettings(chatId, patch) {
        const current = await this.getSettings(chatId);
        const merged = { ...current, ...patch };
        await this.db
            .insert(schema_1.userSettings)
            .values({
            chatId,
            slippageBps: merged.slippageBps,
            buyAmountSol: merged.buyAmountSol,
            priorityFeeLamports: merged.priorityFeeLamports,
        })
            .onConflictDoUpdate({
            target: schema_1.userSettings.chatId,
            set: {
                slippageBps: merged.slippageBps,
                buyAmountSol: merged.buyAmountSol,
                priorityFeeLamports: merged.priorityFeeLamports,
                updatedAt: new Date(),
            },
        });
    }
    // ---- wallets ---------------------------------------------------------
    async getWallet(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.wallets)
            .where((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId))
            .orderBy(schema_1.wallets.walletNumber)
            .limit(1);
        return rows[0] ?? null;
    }
    /** All wallets of a user, ordered by wallet number. */
    async getWallets(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.wallets)
            .where((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId))
            .orderBy(schema_1.wallets.walletNumber);
        return rows;
    }
    /** Active (connected) wallets only. */
    async getActiveWallets(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.wallets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.wallets.active, true)))
            .orderBy(schema_1.wallets.walletNumber);
        return rows;
    }
    async allWallets() {
        return (await this.db.select().from(schema_1.wallets));
    }
    async saveWallet(w) {
        await this.db.insert(schema_1.wallets).values({
            chatId: w.chatId,
            address: w.address,
            encryptedSecret: w.encryptedSecret,
            derivation: w.derivation,
            walletNumber: w.walletNumber,
            type: w.type,
        });
    }
    /** Soft-disconnect / reconnect + last balance check bookkeeping. */
    async updateWalletMeta(chatId, address, patch) {
        await this.db
            .update(schema_1.wallets)
            .set({
            ...(patch.active !== undefined ? { active: patch.active } : {}),
            ...(patch.touchBalanceCheck ? { lastBalanceCheck: new Date() } : {}),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.wallets.address, address)));
    }
    async deleteWalletByAddress(chatId, address) {
        await this.db
            .delete(schema_1.wallets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.wallets.address, address)));
    }
    async deleteAllWallets(chatId) {
        await this.db.delete(schema_1.wallets).where((0, drizzle_orm_1.eq)(schema_1.wallets.chatId, chatId));
    }
    // ---- sniper settings --------------------------------------------------
    async getSniperSettings(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.sniperSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.sniperSettings.chatId, chatId))
            .limit(1);
        return rows[0] ?? {
            chatId,
            status: 'STANDBY',
            positionSize: 10,
            maxDevHold: 20,
            slippage: 10,
            priorityFee: 0.001,
            takeProfit: 100,
            stopLoss: 30,
            antiRug: true,
        };
    }
    async updateSniperSettings(chatId, patch) {
        const current = await this.getSniperSettings(chatId);
        const merged = { ...current, ...patch };
        await this.db
            .insert(schema_1.sniperSettings)
            .values({
            chatId,
            status: merged.status,
            positionSize: merged.positionSize,
            maxDevHold: merged.maxDevHold,
            slippage: merged.slippage,
            priorityFee: merged.priorityFee,
            takeProfit: merged.takeProfit,
            stopLoss: merged.stopLoss,
            antiRug: merged.antiRug,
        })
            .onConflictDoUpdate({
            target: schema_1.sniperSettings.chatId,
            set: {
                status: merged.status,
                positionSize: merged.positionSize,
                maxDevHold: merged.maxDevHold,
                slippage: merged.slippage,
                priorityFee: merged.priorityFee,
                takeProfit: merged.takeProfit,
                stopLoss: merged.stopLoss,
                antiRug: merged.antiRug,
                updatedAt: new Date(),
            },
        });
        return merged;
    }
    // ---- positions --------------------------------------------------------
    async addPosition(p) {
        const rows = await this.db
            .insert(schema_1.positions)
            .values({
            chatId: p.chatId,
            tokenAddress: p.tokenAddress,
            tokenSymbol: p.tokenSymbol,
            tokenName: p.tokenName,
            amountSol: p.amountSol,
            entryPriceUsd: p.entryPriceUsd,
            status: 'open',
        })
            .returning();
        return rows[0];
    }
    async getOpenPositions(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.positions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.positions.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.positions.status, 'open')))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.positions.openedAt));
        return rows;
    }
    async closePosition(chatId, tokenAddress) {
        await this.db
            .update(schema_1.positions)
            .set({ status: 'closed', closedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.positions.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.positions.tokenAddress, tokenAddress), (0, drizzle_orm_1.eq)(schema_1.positions.status, 'open')));
    }
    // ---- copy trade -------------------------------------------------------
    async getCopyTrade(chatId) {
        const rows = await this.db.select().from(schema_1.copyTrade).where((0, drizzle_orm_1.eq)(schema_1.copyTrade.chatId, chatId)).limit(1);
        return rows[0] ?? {
            chatId,
            targetWallet: null,
            status: 'STANDBY',
            mode: 'buy_sell',
            maxSolPerTrade: 1,
            maxDailySol: 10,
            slippage: 10,
            tokenFilter: null,
            dailyUsedSol: 0,
            dailyResetDate: '',
        };
    }
    async updateCopyTrade(chatId, patch) {
        const current = await this.getCopyTrade(chatId);
        const merged = { ...current, ...patch };
        await this.db
            .insert(schema_1.copyTrade)
            .values({
            chatId,
            targetWallet: merged.targetWallet,
            status: merged.status,
            mode: merged.mode,
            maxSolPerTrade: merged.maxSolPerTrade,
            maxDailySol: merged.maxDailySol,
            slippage: merged.slippage,
            tokenFilter: merged.tokenFilter,
            dailyUsedSol: merged.dailyUsedSol,
            dailyResetDate: merged.dailyResetDate,
        })
            .onConflictDoUpdate({
            target: schema_1.copyTrade.chatId,
            set: {
                targetWallet: merged.targetWallet,
                status: merged.status,
                mode: merged.mode,
                maxSolPerTrade: merged.maxSolPerTrade,
                maxDailySol: merged.maxDailySol,
                slippage: merged.slippage,
                tokenFilter: merged.tokenFilter,
                dailyUsedSol: merged.dailyUsedSol,
                dailyResetDate: merged.dailyResetDate,
                updatedAt: new Date(),
            },
        });
    }
    async allActiveCopyTrades() {
        const rows = await this.db
            .select()
            .from(schema_1.copyTrade)
            .where((0, drizzle_orm_1.sql) `${schema_1.copyTrade.status} = 'ACTIVE' AND ${schema_1.copyTrade.targetWallet} IS NOT NULL`);
        return rows;
    }
    // ---- copy-trade signals ------------------------------------------------
    async hasCopytradeSignal(chatId, signature) {
        const rows = await this.db
            .select({ s: schema_1.copytradeSignals.signature })
            .from(schema_1.copytradeSignals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.copytradeSignals.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.copytradeSignals.signature, signature)))
            .limit(1);
        return rows.length > 0;
    }
    async insertCopytradeSignal(chatId, signature, status) {
        await this.db
            .insert(schema_1.copytradeSignals)
            .values({ chatId, signature, status })
            .onConflictDoNothing({ target: [schema_1.copytradeSignals.chatId, schema_1.copytradeSignals.signature] });
    }
    // ---- sessions --------------------------------------------------------
    async getSession(chatId) {
        const rows = await this.db
            .select()
            .from(schema_1.botSessions)
            .where((0, drizzle_orm_1.eq)(schema_1.botSessions.chatId, chatId))
            .limit(1);
        return rows[0] ?? { chatId, state: 'idle', payload: {}, updatedAt: null };
    }
    async saveSession(s) {
        await this.db
            .insert(schema_1.botSessions)
            .values({ chatId: s.chatId, state: s.state, payload: s.payload })
            .onConflictDoUpdate({
            target: schema_1.botSessions.chatId,
            set: { state: s.state, payload: s.payload, updatedAt: new Date() },
        });
    }
    async resetSession(chatId) {
        await this.db
            .insert(schema_1.botSessions)
            .values({ chatId, state: 'idle', payload: {} })
            .onConflictDoUpdate({
            target: schema_1.botSessions.chatId,
            set: { state: 'idle', payload: {}, updatedAt: new Date() },
        });
    }
    // ---- trades ----------------------------------------------------------
    async insertTrade(t) {
        const rows = await this.db
            .insert(schema_1.trades)
            .values({
            chatId: t.chatId,
            side: t.side,
            inputMint: t.inputMint,
            outputMint: t.outputMint,
            inputAmount: t.inputAmount,
            outputAmount: t.outputAmount,
            priceUsd: t.priceUsd,
            slippageBps: t.slippageBps,
            txSignature: t.txSignature,
            status: t.status,
            error: t.error,
        })
            .returning();
        return rows[0];
    }
    async updateTradeStatus(id, status, opts = {}) {
        await this.db
            .update(schema_1.trades)
            .set({
            status,
            txSignature: opts.txSignature,
            error: opts.error,
            confirmedAt: status === 'confirmed' ? new Date() : null,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.trades.id, id));
    }
    async getTrades(chatId, limit = 100) {
        return (await this.db
            .select()
            .from(schema_1.trades)
            .where((0, drizzle_orm_1.eq)(schema_1.trades.chatId, chatId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.trades.createdAt))
            .limit(limit));
    }
    async getTradesForMint(chatId, mint) {
        return (await this.db
            .select()
            .from(schema_1.trades)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.trades.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.trades.status, 'confirmed'), (0, drizzle_orm_1.sql) `(${schema_1.trades.inputMint} = ${mint} OR ${schema_1.trades.outputMint} = ${mint})`))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.trades.createdAt)));
    }
    async countTradesToday() {
        const rows = await this.db
            .select({ c: (0, drizzle_orm_1.count)() })
            .from(schema_1.trades)
            .where((0, drizzle_orm_1.sql) `${schema_1.trades.createdAt} >= now() - interval '1 day'`);
        return Number(rows[0]?.c ?? 0);
    }
    // ---- deposits --------------------------------------------------------
    async insertDeposit(d) {
        await this.db.insert(schema_1.deposits).values(d);
    }
    async getDeposits(chatId, limit = 20) {
        return (await this.db
            .select()
            .from(schema_1.deposits)
            .where((0, drizzle_orm_1.eq)(schema_1.deposits.chatId, chatId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.deposits.createdAt))
            .limit(limit));
    }
    async countDepositsToday() {
        const rows = await this.db
            .select({ c: (0, drizzle_orm_1.count)() })
            .from(schema_1.deposits)
            .where((0, drizzle_orm_1.sql) `${schema_1.deposits.createdAt} >= now() - interval '1 day'`);
        return Number(rows[0]?.c ?? 0);
    }
    // ---- admin events -----------------------------------------------------
    async insertAdminEvent(eventType, traceId, payload) {
        await this.db.insert(schema_1.adminEvents).values({ eventType, traceId, payload });
    }
    // ---- balance snapshots ------------------------------------------------
    async getSnapshots(chatId, address) {
        const rows = await this.db
            .select()
            .from(schema_1.balanceSnapshots)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.balanceSnapshots.chatId, chatId), (0, drizzle_orm_1.eq)(schema_1.balanceSnapshots.address, address)));
        const out = {};
        for (const r of rows)
            out[r.mint] = r.amount;
        return out;
    }
    async saveSnapshots(chatId, address, amounts) {
        for (const [mint, amount] of Object.entries(amounts)) {
            await this.db
                .insert(schema_1.balanceSnapshots)
                .values({ chatId, address, mint, amount })
                .onConflictDoUpdate({
                target: [schema_1.balanceSnapshots.chatId, schema_1.balanceSnapshots.address, schema_1.balanceSnapshots.mint],
                set: { amount, updatedAt: new Date() },
            });
        }
    }
}
exports.Repos = Repos;
//# sourceMappingURL=repos.js.map