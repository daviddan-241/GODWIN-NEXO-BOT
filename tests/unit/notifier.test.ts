/** Admin notifier tests: fan-out, retries, and secret hygiene. */
import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { AdminNotifier } from '../../src/admin/notifier';
import { FakeAdminTransport } from '../helpers/fakes';

function captureLogger(): { logger: pino.Logger; lines: string[] } {
  const lines: string[] = [];
  const stream = { write: (s: string) => lines.push(s) };
  const logger = pino({ level: 'info' }, stream);
  return { logger, lines };
}

describe('admin/notifier', () => {
  it('sends to every admin chat id', async () => {
    const transport = new FakeAdminTransport();
    const { logger } = captureLogger();
    const notifier = new AdminNotifier(transport, [111, 222], logger);
    await notifier.send('hello admins');
    expect(transport.messages.map((m) => m.chatId)).toEqual([111, 222]);
  });

  it('retries transient failures and eventually delivers', async () => {
    const transport = new FakeAdminTransport();
    transport.failCount = 1; // first attempt fails, retry succeeds
    const { logger } = captureLogger();
    const notifier = new AdminNotifier(transport, [111], logger);
    await notifier.send('important');
    expect(transport.messages).toHaveLength(1);
  });

  it('never throws even when the transport is permanently down', async () => {
    const transport = new FakeAdminTransport();
    transport.failCount = 999; // always fail
    const { logger } = captureLogger();
    const notifier = new AdminNotifier(transport, [111], logger);
    await expect(notifier.send('whatever')).resolves.toBeUndefined();
    expect(transport.messages).toHaveLength(0);
  });

  it('does nothing when disabled or when no admins are configured', async () => {
    const transport = new FakeAdminTransport();
    const { logger } = captureLogger();
    const none = new AdminNotifier(transport, [], logger);
    const off = new AdminNotifier(transport, [111], logger, false);
    await none.send('x');
    await off.send('x');
    expect(transport.messages).toHaveLength(0);
  });

  it('never writes the bot token or key material into logs', async () => {
    const transport = new FakeAdminTransport();
    const { logger, lines } = captureLogger();
    const notifier = new AdminNotifier(transport, [111], logger);
    await notifier.send('routine message');
    const joined = lines.join('\n');
    expect(joined).not.toContain('BOT_TOKEN');
    expect(joined).not.toContain('mnemonic');
    expect(joined).not.toContain('private key');
  });
});
