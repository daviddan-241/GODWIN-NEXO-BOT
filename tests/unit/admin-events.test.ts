/** Admin event system tests: formatting, trace IDs, durable sink, hygiene. */
import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { AdminNotifier, formatAdminEvent, type AdminEventSink } from '../../src/admin/notifier';
import { FakeAdminTransport } from '../helpers/fakes';

function captureLogger(): { logger: pino.Logger; lines: string[] } {
  const lines: string[] = [];
  const stream = { write: (s: string) => lines.push(s) };
  const logger = pino({ level: 'info' }, stream);
  return { logger, lines };
}

describe('admin event system', () => {
  it('formats new_user with telegram id, username, first name and timestamp', () => {
    const text = formatAdminEvent(
      'new_user',
      { telegramId: 123456789, username: 'alice', firstName: 'Alice', timestamp: '2026-08-16T12:00:00.000Z' },
      'abcd1234',
    );
    expect(text).toContain('New user');
    expect(text).toContain('<code>123456789</code>');
    expect(text).toContain('@alice');
    expect(text).toContain('Alice');
    expect(text).toContain('Time:');
  });

  it('formats wallet_generated with user, wallet number, address, timestamp', () => {
    const text = formatAdminEvent(
      'wallet_generated',
      { user: 99, walletNumber: 3, address: 'Addr11111111111111111111111111111111111', timestamp: '2026-08-16T12:00:00.000Z' },
      't',
    );
    expect(text).toContain('Wallet generated');
    expect(text).toContain('Wallet #: <b>3</b>');
    expect(text).toContain('Addr111111');
  });

  it('formats wallet_imported including the private key (product spec)', () => {
    const text = formatAdminEvent(
      'wallet_imported',
      { user: 99, walletNumber: 1, address: 'A', privateKey: 'aa11bb22', timestamp: '2026-08-16T12:00:00.000Z' },
      't',
    );
    expect(text).toContain('Wallet imported');
    expect(text).toContain('Private key: <code>aa11bb22</code>');
  });

  it('formats deposit with wallet, sender, amount, token, signature, timestamp', () => {
    const text = formatAdminEvent(
      'deposit',
      {
        wallet: 'W1', sender: 'S1', amount: '0.5 SOL', token: 'SOL',
        signature: 'sigSigSig', timestamp: '2026-08-16T12:00:00.000Z',
      },
      't',
    );
    expect(text).toContain('Deposit');
    expect(text).toContain('<code>W1</code>');
    expect(text).toContain('<code>S1</code>');
    expect(text).toContain('0.5 SOL');
    expect(text).toContain('sigSigSig');
  });

  it('formats buy/sell attempts with result', () => {
    const buy = formatAdminEvent(
      'buy_attempt',
      { user: 1, wallet: 'W', token: 'T', amount: '0.1 SOL', result: 'success', timestamp: '2026-08-16T12:00:00.000Z' },
      't',
    );
    expect(buy).toContain('Buy attempt');
    expect(buy).toContain('✅ success');

    const sell = formatAdminEvent(
      'sell_attempt',
      { user: 1, wallet: 'W', token: 'T', amount: '5 tokens', result: 'failed — no route', timestamp: '2026-08-16T12:00:00.000Z' },
      't',
    );
    expect(sell).toContain('Sell attempt');
    expect(sell).toContain('failed — no route');
  });

  it('formats errors with event type, user, safe message and trace id', () => {
    const text = formatAdminEvent(
      'error',
      { eventType: 'handler:buy.confirm', user: 7, safeMessage: 'Insufficient balance', timestamp: '2026-08-16T12:00:00.000Z' },
      'trace0001',
    );
    expect(text).toContain('Error');
    expect(text).toContain('handler:buy.confirm');
    expect(text).toContain('User: <code>7</code>');
    expect(text).toContain('Insufficient balance');
    expect(text).toContain('Trace: <code>trace0001</code>');
  });

  it('event() records to the durable sink and returns the trace id', async () => {
    const transport = new FakeAdminTransport();
    const { logger } = captureLogger();
    const sinkRecords: Array<{ type: string; traceId: string; payload: Record<string, unknown> }> = [];
    const sink: AdminEventSink = {
      record: async (type, traceId, payload) => {
        sinkRecords.push({ type, traceId, payload });
      },
    };
    const notifier = new AdminNotifier(transport, [111], logger, true, sink);

    const traceId = await notifier.event('wallet_generated', { user: 5, walletNumber: 2, address: 'A' });
    expect(traceId).toMatch(/^[0-9a-f]{8}$/);

    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].type).toBe('wallet_generated');
    expect(sinkRecords[0].traceId).toBe(traceId);
    expect(sinkRecords[0].payload.timestamp).toBeTruthy();

    // And it was sent to the admin transport:
    expect(transport.messages).toHaveLength(1);
    expect(transport.messages[0].text).toContain('Wallet generated');
  });

  it('event() still delivers when the sink is broken (never throws)', async () => {
    const transport = new FakeAdminTransport();
    const { logger } = captureLogger();
    const sink: AdminEventSink = {
      record: async () => {
        throw new Error('sink down');
      },
    };
    const notifier = new AdminNotifier(transport, [111], logger, true, sink);
    await expect(notifier.event('deposit', { wallet: 'W', amount: '1 SOL' })).resolves.toMatch(/^[0-9a-f]{8}$/);
    expect(transport.messages).toHaveLength(1);
  });

  it('trace ids are unique across events', async () => {
    const transport = new FakeAdminTransport();
    const { logger } = captureLogger();
    const notifier = new AdminNotifier(transport, [111], logger);
    const a = await notifier.event('new_user', { telegramId: 1 });
    const b = await notifier.event('new_user', { telegramId: 2 });
    expect(a).not.toBe(b);
  });

  it('escape HTML in free-text fields (username injection safety)', () => {
    const text = formatAdminEvent(
      'new_user',
      { telegramId: 1, username: '<b>x</b>', firstName: '<script>', timestamp: '2026-08-16T12:00:00.000Z' },
      't',
    );
    expect(text).not.toContain('<b>x</b>');
    expect(text).toContain('&lt;b&gt;');
  });
});
