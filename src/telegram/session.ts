/**
 * Conversation / state management for the Telegram layer.
 *
 * Each chat has a small finite-state machine persisted in PostgreSQL
 * (survives restarts). Handlers read `ctx.session.state` + `payload` and
 * transition explicitly; `/cancel` always returns to `idle`.
 */
import type { Repos } from '../db/repos';

export interface SessionData {
  state: string;
  payload: Record<string, unknown>;
}

export interface SessionStore {
  get(chatId: number): Promise<SessionData>;
  save(chatId: number, session: SessionData): Promise<void>;
  reset(chatId: number): Promise<void>;
}

export const IDLE_STATE = 'idle';

export class DbSessionStore implements SessionStore {
  constructor(private repos: Repos) {}

  async get(chatId: number): Promise<SessionData> {
    const s = await this.repos.getSession(chatId);
    return { state: s.state, payload: (s.payload ?? {}) as Record<string, unknown> };
  }

  async save(chatId: number, session: SessionData): Promise<void> {
    await this.repos.saveSession({ chatId, state: session.state, payload: session.payload });
  }

  async reset(chatId: number): Promise<void> {
    await this.repos.resetSession(chatId);
  }
}

/** In-memory store — used by unit tests that run without a database. */
export class MemorySessionStore implements SessionStore {
  private map = new Map<number, SessionData>();

  async get(chatId: number): Promise<SessionData> {
    return this.map.get(chatId) ?? { state: IDLE_STATE, payload: {} };
  }

  async save(chatId: number, session: SessionData): Promise<void> {
    this.map.set(chatId, { ...session, payload: { ...session.payload } });
  }

  async reset(chatId: number): Promise<void> {
    this.map.delete(chatId);
  }
}
