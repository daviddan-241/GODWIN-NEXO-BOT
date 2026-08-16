/**
 * HTTP health server (node:http, zero dependencies).
 *
 * Endpoints:
 *   /live   — liveness: the process is up (always 200).
 *   /health — database + Solana RPC required; Telegram optional (degraded).
 *   /ready  — database + Solana RPC + Telegram all required (200 only when
 *             the bot can serve users).
 */
import http from 'node:http';
import type { Logger } from '../logging/logger';
import { withTimeout } from '../util/retry';
import { APP_NAME, APP_VERSION } from '../config/constants';

export interface HealthChecks {
  database(): Promise<void>;
  rpc(): Promise<string>;
  bot(): Promise<boolean>;
}

interface CheckResult {
  ok: boolean;
  detail?: string;
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

export function createHealthServer(checks: HealthChecks, logger: Logger): http.Server {
  const startedAt = Date.now();

  const runCheck = async (name: string, fn: () => Promise<unknown>): Promise<CheckResult> => {
    try {
      await withTimeout(fn, 5_000, `${name} health check`);
      return { ok: true };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn({ check: name, err: detail }, 'health check failed');
      return { ok: false, detail: detail.slice(0, 200) };
    }
  };

  const server = http.createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/live') {
      json(res, 200, { status: 'ok', app: APP_NAME, version: APP_VERSION });
      return;
    }

    if (path === '/health' || path === '/ready' || path === '/') {
      const [database, rpc, bot] = await Promise.all([
        runCheck('database', checks.database),
        runCheck('rpc', checks.rpc),
        runCheck('bot', checks.bot),
      ]);

      const criticalOk = database.ok && rpc.ok;
      const allOk = criticalOk && bot.ok;
      const code = path === '/ready' ? (allOk ? 200 : 503) : criticalOk ? 200 : 503;
      const status = allOk ? 'ok' : criticalOk ? 'degraded' : 'unavailable';

      json(res, code, {
        status,
        app: APP_NAME,
        version: APP_VERSION,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        checks: { database, rpc, bot },
      });
      return;
    }

    json(res, 404, { status: 'not_found' });
  });

  return server;
}
