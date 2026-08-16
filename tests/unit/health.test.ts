/** Health server tests over real HTTP. */
import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import pino from 'pino';
import { createHealthServer } from '../../src/health/server';

const silent = pino({ level: 'silent' });
let server: Server | null = null;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function startServer(checks: Parameters<typeof createHealthServer>[0]): Promise<string> {
  server = createHealthServer(checks, silent);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

const healthy = {
  database: async () => undefined,
  rpc: async () => 'ok',
  bot: async () => true,
};

describe('health server', () => {
  it('GET / returns plain "OK" (UptimeRobot)', async () => {
    const base = await startServer(healthy);
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('GET /health returns plain "OK" (UptimeRobot)', async () => {
    const base = await startServer(healthy);
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });

  it('GET /live returns 200 unconditionally', async () => {
    const base = await startServer(healthy);
    const res = await fetch(`${base}/live`);
    expect(res.status).toBe(200);
  });

  it('GET /ready returns 200 with full checks when everything is up', async () => {
    const base = await startServer(healthy);
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; checks: { database: { ok: boolean }; rpc: { ok: boolean }; bot: { ok: boolean } } };
    expect(body.status).toBe('ok');
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.rpc.ok).toBe(true);
    expect(body.checks.bot.ok).toBe(true);
  });

  it('GET /ready returns 503 when the bot is unreachable', async () => {
    const base = await startServer({
      ...healthy,
      bot: async () => {
        throw new Error('telegram down');
      },
    });
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(503);
  });

  it('GET /ready returns 503 when the database is down', async () => {
    const base = await startServer({
      ...healthy,
      database: async () => {
        throw new Error('connection refused');
      },
    });
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('unavailable');
  });

  it('GET /ready returns 503 when the RPC is down', async () => {
    const base = await startServer({
      ...healthy,
      rpc: async () => {
        throw new Error('rpc down');
      },
    });
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(503);
  });

  it('unknown paths return 404', async () => {
    const base = await startServer(healthy);
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
