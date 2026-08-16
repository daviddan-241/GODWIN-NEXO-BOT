/** In-memory session store tests. */
import { describe, it, expect } from 'vitest';
import { MemorySessionStore, IDLE_STATE } from '../../src/telegram/session';

describe('telegram/session (memory store)', () => {
  it('starts idle with an empty payload', async () => {
    const store = new MemorySessionStore();
    const s = await store.get(42);
    expect(s.state).toBe(IDLE_STATE);
    expect(s.payload).toEqual({});
  });

  it('persists state and payload', async () => {
    const store = new MemorySessionStore();
    await store.save(42, { state: 'awaiting_buy_token', payload: { tokenMint: 'mint' } });
    const s = await store.get(42);
    expect(s.state).toBe('awaiting_buy_token');
    expect(s.payload.tokenMint).toBe('mint');
  });

  it('isolates chats from each other', async () => {
    const store = new MemorySessionStore();
    await store.save(1, { state: 'a', payload: {} });
    const other = await store.get(2);
    expect(other.state).toBe(IDLE_STATE);
  });

  it('reset returns to idle', async () => {
    const store = new MemorySessionStore();
    await store.save(1, { state: 'awaiting_sell_pct', payload: { x: 1 } });
    await store.reset(1);
    const s = await store.get(1);
    expect(s.state).toBe(IDLE_STATE);
    expect(s.payload).toEqual({});
  });
});
