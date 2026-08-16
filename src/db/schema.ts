/**
 * Database schema (PostgreSQL via drizzle-orm).
 *
 * Amounts are stored as TEXT holding raw integer lamports/token-units to
 * avoid any float precision issues (they are compared with BigInt in code).
 */
import {
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  index,
  doublePrecision,
  boolean,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: bigint('chat_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  /** Monotonic count of wallets ever generated/imported by this user. */
  walletCounter: integer('wallet_counter').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable('user_settings', {
  chatId: bigint('chat_id', { mode: 'number' })
    .primaryKey()
    .references(() => users.chatId, { onDelete: 'cascade' }),
  slippageBps: integer('slippage_bps').notNull().default(100),
  buyAmountSol: text('buy_amount_sol').notNull().default('0.1'),
  priorityFeeLamports: integer('priority_fee_lamports').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One encrypted wallet per user. `encryptedSecret` is a JSON blob produced
 * by wallet/crypto.ts (AES-256-GCM; the key never touches the database).
 */
export const wallets = pgTable('wallets', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chatId: bigint('chat_id', { mode: 'number' })
    .notNull()
    .references(() => users.chatId, { onDelete: 'cascade' }),
  address: text('address').notNull(),
  encryptedSecret: jsonb('encrypted_secret').notNull(),
  derivation: text('derivation').notNull(), // 'mnemonic' | 'private_key'
  /** Per-user ordinal of this wallet (1 = first wallet). */
  walletNumber: integer('wallet_number').notNull().default(1),
  /** 'generated' | 'imported' | 'seed_imported' */
  type: text('type').notNull().default('generated'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Conversation state for the Telegram FSM (survives restarts). */
export const botSessions = pgTable('bot_sessions', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  state: text('state').notNull().default('idle'),
  payload: jsonb('payload').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const trades = pgTable(
  'trades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => users.chatId, { onDelete: 'cascade' }),
    side: text('side').notNull(), // 'buy' | 'sell'
    inputMint: text('input_mint').notNull(),
    outputMint: text('output_mint').notNull(),
    inputAmount: text('input_amount').notNull(), // raw base units
    outputAmount: text('output_amount').notNull(),
    priceUsd: text('price_usd'), // USD price per 1 whole output token, if known
    slippageBps: integer('slippage_bps').notNull(),
    txSignature: text('tx_signature'),
    status: text('status').notNull().default('pending'), // pending|confirmed|failed
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [index('idx_trades_chat_created').on(t.chatId, t.createdAt)],
);

export const deposits = pgTable(
  'deposits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => users.chatId, { onDelete: 'cascade' }),
    mint: text('mint').notNull(),
    amount: text('amount').notNull(), // raw base units (lamports for SOL)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_deposits_chat_created').on(t.chatId, t.createdAt)],
);

/** Last observed on-chain balance per (user, wallet address, mint). */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => users.chatId, { onDelete: 'cascade' }),
    address: text('address').notNull().default(''),
    mint: text('mint').notNull(),
    amount: text('amount').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.address, t.mint] })],
);

/** Tracks which SQL migrations have been applied. */
export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Admin event log: every admin notification is recorded with a trace ID. */
export const adminEvents = pgTable(
  'admin_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventType: text('event_type').notNull(),
    traceId: text('trace_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_admin_events_created').on(t.createdAt),
    index('idx_admin_events_type').on(t.eventType),
  ],
);

/** AI Sniper settings per user (exact screenshot defaults). */
export const sniperSettings = pgTable('sniper_settings', {
  chatId: bigint('chat_id', { mode: 'number' })
    .primaryKey()
    .references(() => users.chatId, { onDelete: 'cascade' }),
  status: text('status').notNull().default('STANDBY'),
  positionSize: doublePrecision('position_size').notNull().default(10),
  maxDevHold: doublePrecision('max_dev_hold').notNull().default(20),
  slippage: doublePrecision('slippage').notNull().default(10),
  priorityFee: doublePrecision('priority_fee').notNull().default(0.001),
  takeProfit: doublePrecision('take_profit').notNull().default(100),
  stopLoss: doublePrecision('stop_loss').notNull().default(30),
  antiRug: boolean('anti_rug').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Open/closed token positions (opened by real swaps). */
export const positions = pgTable(
  'positions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    chatId: bigint('chat_id', { mode: 'number' })
      .notNull()
      .references(() => users.chatId, { onDelete: 'cascade' }),
    tokenAddress: text('token_address').notNull(),
    tokenSymbol: text('token_symbol').notNull(),
    tokenName: text('token_name').notNull(),
    amountSol: doublePrecision('amount_sol').notNull(),
    entryPriceUsd: doublePrecision('entry_price_usd').notNull(),
    status: text('status').notNull().default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('idx_positions_chat').on(t.chatId, t.status)],
);

/** Copy-trade configuration per user. */
export const copyTrade = pgTable('copy_trade', {
  chatId: bigint('chat_id', { mode: 'number' })
    .primaryKey()
    .references(() => users.chatId, { onDelete: 'cascade' }),
  targetWallet: text('target_wallet'),
  status: text('status').notNull().default('STANDBY'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
