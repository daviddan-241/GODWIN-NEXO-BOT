"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthServer = createHealthServer;
/**
 * HTTP health server (node:http, zero dependencies).
 *
 * Endpoints:
 *   /live   — liveness: the process is up (always 200).
 *   /health — database + Solana RPC required; Telegram optional (degraded).
 *   /ready  — database + Solana RPC + Telegram all required (200 only when
 *             the bot can serve users).
 */
const node_http_1 = __importDefault(require("node:http"));
const retry_1 = require("../util/retry");
const constants_1 = require("../config/constants");
function json(res, code, body) {
    const payload = JSON.stringify(body, null, 2);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
}
function createHealthServer(checks, logger) {
    const startedAt = Date.now();
    const runCheck = async (name, fn) => {
        try {
            await (0, retry_1.withTimeout)(fn, 5_000, `${name} health check`);
            return { ok: true };
        }
        catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            logger.warn({ check: name, err: detail }, 'health check failed');
            return { ok: false, detail: detail.slice(0, 200) };
        }
    };
    const server = node_http_1.default.createServer(async (req, res) => {
        const path = (req.url ?? '/').split('?')[0];
        if (path === '/' || path === '/health') {
            // UptimeRobot-compatible plain "OK" (the bot process keeps running
            // independently of health-check requests).
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('OK');
            return;
        }
        if (path === '/live') {
            json(res, 200, { status: 'ok', app: constants_1.APP_NAME, version: constants_1.APP_VERSION });
            return;
        }
        if (path === '/ready') {
            const [database, rpc, bot] = await Promise.all([
                runCheck('database', checks.database),
                runCheck('rpc', checks.rpc),
                runCheck('bot', checks.bot),
            ]);
            const criticalOk = database.ok && rpc.ok;
            const allOk = criticalOk && bot.ok;
            const code = allOk ? 200 : 503;
            const status = allOk ? 'ok' : criticalOk ? 'degraded' : 'unavailable';
            json(res, code, {
                status,
                app: constants_1.APP_NAME,
                version: constants_1.APP_VERSION,
                uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
                checks: { database, rpc, bot },
            });
            return;
        }
        json(res, 404, { status: 'not_found' });
    });
    return server;
}
//# sourceMappingURL=server.js.map