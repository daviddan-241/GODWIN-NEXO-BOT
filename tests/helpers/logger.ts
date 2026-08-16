/** Test logger: captures lines so tests can assert on log hygiene. */
import pino from 'pino';

export interface TestLogger {
  logger: pino.Logger;
  lines: string[];
}

export function createTestLogger(): TestLogger {
  const lines: string[] = [];
  const stream = { write: (s: string) => lines.push(s) };
  const logger = pino({ level: 'info' }, stream);
  return { logger, lines };
}
