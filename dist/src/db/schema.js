"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copytradeSignals = exports.copyTrade = exports.sniperSeen = exports.positions = exports.sniperSettings = exports.adminEvents = exports.schemaMigrations = exports.balanceSnapshots = exports.deposits = exports.trades = exports.botSessions = exports.wallets = exports.userSettings = exports.users = void 0;
/**
 * Database schema (PostgreSQL via drizzle-orm).
 *
 * Amounts are stored as TEXT holding raw integer lamports/token-units to
 * avoid any float precision issues (they are compared with BigInt in code).
 */
const pg_core_1 = require("drizzle-orm/pg-core");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' }).notNull().unique(),
    username: (0, pg_core_1.text)('username'),
    firstName: (0, pg_core_1.text)('first_name'),
    /** Monotonic count of wallets ever generated/imported by this user. */
    walletCounter: (0, pg_core_1.integer)('wallet_counter').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.userSettings = (0, pg_core_1.pgTable)('user_settings', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .primaryKey()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    slippageBps: (0, pg_core_1.integer)('slippage_bps').notNull().default(100),
    buyAmountSol: (0, pg_core_1.text)('buy_amount_sol').notNull().default('0.1'),
    priorityFeeLamports: (0, pg_core_1.integer)('priority_fee_lamports').notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/**
 * One encrypted wallet per user. `encryptedSecret` is a JSON blob produced
 * by wallet/crypto.ts (AES-256-GCM; the key never touches the database).
 */
exports.wallets = (0, pg_core_1.pgTable)('wallets', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    address: (0, pg_core_1.text)('address').notNull(),
    encryptedSecret: (0, pg_core_1.jsonb)('encrypted_secret').notNull(),
    derivation: (0, pg_core_1.text)('derivation').notNull(), // 'mnemonic' | 'private_key'
    /** Per-user ordinal of this wallet (1 = first wallet). */
    walletNumber: (0, pg_core_1.integer)('wallet_number').notNull().default(1),
    /** 'generated' | 'imported' | 'seed_imported' */
    type: (0, pg_core_1.text)('type').notNull().default('generated'),
    /** Soft-disconnect flag (wallet rows are kept for audit). */
    active: (0, pg_core_1.boolean)('active').notNull().default(true),
    lastBalanceCheck: (0, pg_core_1.timestamp)('last_balance_check', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Conversation state for the Telegram FSM (survives restarts). */
exports.botSessions = (0, pg_core_1.pgTable)('bot_sessions', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' }).primaryKey(),
    state: (0, pg_core_1.text)('state').notNull().default('idle'),
    payload: (0, pg_core_1.jsonb)('payload').notNull().default({}),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.trades = (0, pg_core_1.pgTable)('trades', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    side: (0, pg_core_1.text)('side').notNull(), // 'buy' | 'sell'
    inputMint: (0, pg_core_1.text)('input_mint').notNull(),
    outputMint: (0, pg_core_1.text)('output_mint').notNull(),
    inputAmount: (0, pg_core_1.text)('input_amount').notNull(), // raw base units
    outputAmount: (0, pg_core_1.text)('output_amount').notNull(),
    priceUsd: (0, pg_core_1.text)('price_usd'), // USD price per 1 whole output token, if known
    slippageBps: (0, pg_core_1.integer)('slippage_bps').notNull(),
    txSignature: (0, pg_core_1.text)('tx_signature'),
    status: (0, pg_core_1.text)('status').notNull().default('pending'), // pending|confirmed|failed
    error: (0, pg_core_1.text)('error'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: (0, pg_core_1.timestamp)('confirmed_at', { withTimezone: true }),
}, (t) => [(0, pg_core_1.index)('idx_trades_chat_created').on(t.chatId, t.createdAt)]);
exports.deposits = (0, pg_core_1.pgTable)('deposits', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    mint: (0, pg_core_1.text)('mint').notNull(),
    amount: (0, pg_core_1.text)('amount').notNull(), // raw base units (lamports for SOL)
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_deposits_chat_created').on(t.chatId, t.createdAt)]);
/** Last observed on-chain balance per (user, wallet address, mint). */
exports.balanceSnapshots = (0, pg_core_1.pgTable)('balance_snapshots', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    address: (0, pg_core_1.text)('address').notNull().default(''),
    mint: (0, pg_core_1.text)('mint').notNull(),
    amount: (0, pg_core_1.text)('amount').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.primaryKey)({ columns: [t.chatId, t.address, t.mint] })]);
/** Tracks which SQL migrations have been applied. */
exports.schemaMigrations = (0, pg_core_1.pgTable)('schema_migrations', {
    version: (0, pg_core_1.text)('version').primaryKey(),
    appliedAt: (0, pg_core_1.timestamp)('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Admin event log: every admin notification is recorded with a trace ID. */
exports.adminEvents = (0, pg_core_1.pgTable)('admin_events', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    eventType: (0, pg_core_1.text)('event_type').notNull(),
    traceId: (0, pg_core_1.text)('trace_id').notNull(),
    payload: (0, pg_core_1.jsonb)('payload').notNull().default({}),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_admin_events_created').on(t.createdAt),
    (0, pg_core_1.index)('idx_admin_events_type').on(t.eventType),
]);
/** AI Sniper settings per user (exact screenshot defaults). */
exports.sniperSettings = (0, pg_core_1.pgTable)('sniper_settings', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .primaryKey()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    status: (0, pg_core_1.text)('status').notNull().default('STANDBY'),
    positionSize: (0, pg_core_1.doublePrecision)('position_size').notNull().default(10),
    maxDevHold: (0, pg_core_1.doublePrecision)('max_dev_hold').notNull().default(20),
    slippage: (0, pg_core_1.doublePrecision)('slippage').notNull().default(10),
    priorityFee: (0, pg_core_1.doublePrecision)('priority_fee').notNull().default(0.001),
    takeProfit: (0, pg_core_1.doublePrecision)('take_profit').notNull().default(100),
    stopLoss: (0, pg_core_1.doublePrecision)('stop_loss').notNull().default(30),
    antiRug: (0, pg_core_1.boolean)('anti_rug').notNull().default(true),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Open/closed token positions (opened by real swaps). */
exports.positions = (0, pg_core_1.pgTable)('positions', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    tokenAddress: (0, pg_core_1.text)('token_address').notNull(),
    tokenSymbol: (0, pg_core_1.text)('token_symbol').notNull(),
    tokenName: (0, pg_core_1.text)('token_name').notNull(),
    amountSol: (0, pg_core_1.doublePrecision)('amount_sol').notNull(),
    entryPriceUsd: (0, pg_core_1.doublePrecision)('entry_price_usd').notNull(),
    status: (0, pg_core_1.text)('status').notNull().default('open'),
    /** True when the position was opened by the AI Sniper (TP/SL managed). */
    sniper: (0, pg_core_1.boolean)('sniper').notNull().default(false),
    openedAt: (0, pg_core_1.timestamp)('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
}, (t) => [(0, pg_core_1.index)('idx_positions_chat').on(t.chatId, t.status)]);
/** Mints the AI Sniper has already scanned (restart-safe dedupe). */
exports.sniperSeen = (0, pg_core_1.pgTable)('sniper_seen', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    mint: (0, pg_core_1.text)('mint').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.primaryKey)({ columns: [t.chatId, t.mint] })]);
/** Copy-trade configuration per user. */
exports.copyTrade = (0, pg_core_1.pgTable)('copy_trade', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .primaryKey()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    targetWallet: (0, pg_core_1.text)('target_wallet'),
    status: (0, pg_core_1.text)('status').notNull().default('STANDBY'),
    mode: (0, pg_core_1.text)('mode').notNull().default('buy_sell'), // 'buy_sell' | 'buy_only'
    maxSolPerTrade: (0, pg_core_1.doublePrecision)('max_sol_per_trade').notNull().default(1),
    maxDailySol: (0, pg_core_1.doublePrecision)('max_daily_sol').notNull().default(10),
    slippage: (0, pg_core_1.doublePrecision)('slippage').notNull().default(10),
    tokenFilter: (0, pg_core_1.text)('token_filter'),
    dailyUsedSol: (0, pg_core_1.doublePrecision)('daily_used_sol').notNull().default(0),
    dailyResetDate: (0, pg_core_1.text)('daily_reset_date').notNull().default(''),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/** Copy-trade signal dedupe (one row per target transaction). */
exports.copytradeSignals = (0, pg_core_1.pgTable)('copytrade_signals', {
    chatId: (0, pg_core_1.bigint)('chat_id', { mode: 'number' })
        .notNull()
        .references(() => exports.users.chatId, { onDelete: 'cascade' }),
    signature: (0, pg_core_1.text)('signature').notNull(),
    status: (0, pg_core_1.text)('status').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.primaryKey)({ columns: [t.chatId, t.signature] })]);
//# sourceMappingURL=schema.js.map