/** Locates the NEXO logo asset across source/compiled layouts. */
import fs from 'node:fs';
import path from 'node:path';

export function resolveLogoPath(): string {
  const candidates = [
    // compiled (dist/src/telegram -> dist/assets) and source (src/telegram -> repo/assets)
    path.resolve(__dirname, '..', '..', 'assets', 'nexo_logo_clean.png'),
    path.resolve(__dirname, '..', '..', 'assets', 'nexo_logo.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}
