/**
 * Thin repository layer over drizzle. Keeps SQL in one place and gives the
 * rest of the app plain functions/types to depend on.
 */
import { eq, desc, and, count, sql } from 'drizzle-orm';
import type { Db } from './client';
import {
  users,
  userSettings,
  wallets,
  botSessions,
  trades,
  deposits,
  balanceSnapshots,
  adminEvents,
} from './schema';

export interface UserRecord {
  chatId: number;
  username: string | null;
  firstName: string | null;
}

export interface SettingsRecord {
  chatId: number;
  slippageBps: number;
  buyAmountSol: string;
  priorityFeeLamports: number;
}

export interface WalletRecord {
  chatId: number;
  address: string;
  encryptedSecret: unknown;
  derivation: 'mnemonic' | 'private_key';
  walletNumber: number;
  createdAt: Date;
}

export interface TradeRecord {
  id: number;
  chatId: number;
  side: 'buy' | 'sell';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceUsd: string | null;
  slippageBps: number;
  txSignature: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  error: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface DepositRecord {
  id: number;
  chatId: number;
  mint: string;
  amount: string;
  createdAt: Date;
}

export interface SessionRecord {
  chatId: number;
  state: string;
  payload: Record<string, unknown>;
}

export class Repos {
  constructor(private db: Db) {}

  // ---- users -----------------------------------------------------------
  async upsertUser(u: UserRecord): Promise<void> {
    await this.db
      .insert(users)
      .values({ chatId: u.chatId, username: u.username, firstName: u.firstName })
      .onConflictDoUpdate({
        target: users.chatId,
        set: { username: u.username, firstName: u.firstName },
      });
  }

  /** Lightweight existence check (used for "new user" detection). */
  async hasUser(chatId: number): Promise<boolean> {
    const rows = await this.db
      .select({ c: count() })
      .from(users)
      .where(eq(users.chatId, chatId));
    return Number(rows[0]?.c ?? 0) > 0;
  }

  /** Ensures a users row exists (no-op when it already does). */
  async ensureUser(chatId: number): Promise<void> {
    await this.db
      .insert(users)
      .values({ chatId })
      .onConflictDoNothing({ target: users.chatId });
  }

  /**
   * Atomically increments the user's wallet counter and returns the new
   * value — used as the wallet number shown to users/admins.
   */
  async nextWalletNumber(chatId: number): Promise<number> {
    const rows = await this.db
      .update(users)
      .set({ walletCounter: sql`${users.walletCounter} + 1` })
      .where(eq(users.chatId, chatId))
      .returning({ walletCounter: users.walletCounter });
    return rows[0]?.walletCounter ?? 1;
  }

  async countUsers(): Promise<number> {
    const rows = await this.db.select({ c: count() }).from(users);
    return Number(rows[0]?.c ?? 0);
  }

  async allUserChatIds(): Promise<number[]> {
    const rows = await this.db.select({ chatId: users.chatId }).from(users);
    return rows.map((r) => r.chatId);
  }

  // ---- settings --------------------------------------------------------
  async getSettings(chatId: number): Promise<SettingsRecord> {
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.chatId, chatId))
      .limit(1);
    return rows[0] as SettingsRecord | undefined ?? {
      chatId,
      slippageBps: 100,
      buyAmountSol: '0.1',
      priorityFeeLamports: 0,
    };
  }

  async updateSettings(chatId: number, patch: Partial<Omit<SettingsRecord, 'chatId'>>): Promise<void> {
    const current = await this.getSettings(chatId);
    const merged = { ...current, ...patch };
    await this.db
      .insert(userSettings)
      .values({
        chatId,
        slippageBps: merged.slippageBps,
        buyAmountSol: merged.buyAmountSol,
        priorityFeeLamports: merged.priorityFeeLamports,
      })
      .onConflictDoUpdate({
        target: userSettings.chatId,
        set: {
          slippageBps: merged.slippageBps,
          buyAmountSol: merged.buyAmountSol,
          priorityFeeLamports: merged.priorityFeeLamports,
          updatedAt: new Date(),
        },
      });
  }

  // ---- wallets ---------------------------------------------------------
  async getWallet(chatId: number): Promise<WalletRecord | null> {
    const rows = await this.db.select().from(wallets).where(eq(wallets.chatId, chatId)).limit(1);
    return (rows[0] as WalletRecord | undefined) ?? null;
  }

  async allWallets(): Promise<WalletRecord[]> {
    return (await this.db.select().from(wallets)) as WalletRecord[];
  }

  async saveWallet(w: Omit<WalletRecord, 'createdAt'>): Promise<void> {
    await this.db
      .insert(wallets)
      .values({
        chatId: w.chatId,
        address: w.address,
        encryptedSecret: w.encryptedSecret,
        derivation: w.derivation,
        walletNumber: w.walletNumber,
      })
      .onConflictDoUpdate({
        target: wallets.chatId,
        set: {
          address: w.address,
          encryptedSecret: w.encryptedSecret,
          derivation: w.derivation,
          walletNumber: w.walletNumber,
        },
      });
  }

  async deleteWallet(chatId: number): Promise<void> {
    await this.db.delete(wallets).where(eq(wallets.chatId, chatId));
  }

  // ---- sessions --------------------------------------------------------
  async getSession(chatId: number): Promise<SessionRecord> {
    const rows = await this.db
      .select()
      .from(botSessions)
      .where(eq(botSessions.chatId, chatId))
      .limit(1);
    return (rows[0] as SessionRecord | undefined) ?? { chatId, state: 'idle', payload: {} };
  }

  async saveSession(s: SessionRecord): Promise<void> {
    await this.db
      .insert(botSessions)
      .values({ chatId: s.chatId, state: s.state, payload: s.payload })
      .onConflictDoUpdate({
        target: botSessions.chatId,
        set: { state: s.state, payload: s.payload, updatedAt: new Date() },
      });
  }

  async resetSession(chatId: number): Promise<void> {
    await this.db
      .insert(botSessions)
      .values({ chatId, state: 'idle', payload: {} })
      .onConflictDoUpdate({
        target: botSessions.chatId,
        set: { state: 'idle', payload: {}, updatedAt: new Date() },
      });
  }

  // ---- trades ----------------------------------------------------------
  async insertTrade(t: Omit<TradeRecord, 'id' | 'createdAt' | 'confirmedAt'>): Promise<TradeRecord> {
    const rows = await this.db
      .insert(trades)
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
    return rows[0] as TradeRecord;
  }

  async updateTradeStatus(
    id: number,
    status: 'pending' | 'confirmed' | 'failed',
    opts: { txSignature?: string; error?: string | null } = {},
  ): Promise<void> {
    await this.db
      .update(trades)
      .set({
        status,
        txSignature: opts.txSignature,
        error: opts.error,
        confirmedAt: status === 'confirmed' ? new Date() : null,
      })
      .where(eq(trades.id, id));
  }

  async getTrades(chatId: number, limit = 100): Promise<TradeRecord[]> {
    return (await this.db
      .select()
      .from(trades)
      .where(eq(trades.chatId, chatId))
      .orderBy(desc(trades.createdAt))
      .limit(limit)) as TradeRecord[];
  }

  async getTradesForMint(chatId: number, mint: string): Promise<TradeRecord[]> {
    return (await this.db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.chatId, chatId),
          eq(trades.status, 'confirmed'),
          sql`(${trades.inputMint} = ${mint} OR ${trades.outputMint} = ${mint})`,
        ),
      )
      .orderBy(desc(trades.createdAt))) as TradeRecord[];
  }

  async countTradesToday(): Promise<number> {
    const rows = await this.db
      .select({ c: count() })
      .from(trades)
      .where(sql`${trades.createdAt} >= now() - interval '1 day'`);
    return Number(rows[0]?.c ?? 0);
  }

  // ---- deposits --------------------------------------------------------
  async insertDeposit(d: { chatId: number; mint: string; amount: string }): Promise<void> {
    await this.db.insert(deposits).values(d);
  }

  async getDeposits(chatId: number, limit = 20): Promise<DepositRecord[]> {
    return (await this.db
      .select()
      .from(deposits)
      .where(eq(deposits.chatId, chatId))
      .orderBy(desc(deposits.createdAt))
      .limit(limit)) as DepositRecord[];
  }

  async countDepositsToday(): Promise<number> {
    const rows = await this.db
      .select({ c: count() })
      .from(deposits)
      .where(sql`${deposits.createdAt} >= now() - interval '1 day'`);
    return Number(rows[0]?.c ?? 0);
  }

  // ---- admin events -----------------------------------------------------
  async insertAdminEvent(
    eventType: string,
    traceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(adminEvents).values({ eventType, traceId, payload });
  }

  // ---- balance snapshots ------------------------------------------------
  async getSnapshots(chatId: number): Promise<Record<string, string>> {
    const rows = await this.db
      .select()
      .from(balanceSnapshots)
      .where(eq(balanceSnapshots.chatId, chatId));
    const out: Record<string, string> = {};
    for (const r of rows) out[r.mint] = r.amount;
    return out;
  }

  async saveSnapshots(chatId: number, amounts: Record<string, string>): Promise<void> {
    for (const [mint, amount] of Object.entries(amounts)) {
      await this.db
        .insert(balanceSnapshots)
        .values({ chatId, mint, amount })
        .onConflictDoUpdate({
          target: [balanceSnapshots.chatId, balanceSnapshots.mint],
          set: { amount, updatedAt: new Date() },
        });
    }
  }
}
