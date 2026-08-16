/**
 * Minimal JSON-RPC 2.0 test server for exercising the Solana RPC layer
 * over real HTTP without touching the network. Used ONLY by tests.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

type RpcHandler = (params: unknown) => unknown;

export class MockRpcServer {
  url = '';
  private server: http.Server;
  private handlers = new Map<string, RpcHandler>();
  requests: Array<{ method: string; params: unknown }> = [];

  constructor() {
    this.server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        try {
          const rpc = JSON.parse(body) as { id: number; method: string; params?: unknown };
          this.requests.push({ method: rpc.method, params: rpc.params });
          const handler = this.handlers.get(rpc.method);
          if (!handler) {
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: rpc.id,
                error: { code: -32601, message: `method not found: ${rpc.method}` },
              }),
            );
            return;
          }
          res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: handler(rpc.params) }));
        } catch (err) {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32700, message: String(err) },
            }),
          );
        }
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', () => resolve()));
    const address = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
  }

  handle(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
