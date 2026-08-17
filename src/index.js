/**
 * Prebuilt launcher for hosts that run `node src/index.js` WITHOUT a
 * TypeScript build step (e.g. a Render service whose build command is
 * plain `npm install`).
 *
 * The compiled application is committed under dist/ alongside the source,
 * so this file simply loads it. Hosts that build the project themselves
 * (Docker, or `npm run build` + `node dist/src/index.js`) bypass this
 * launcher entirely.
 */
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../dist/src/index.js');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('Cannot find module') && message.includes('dist')) {
    console.error(
      '[fatal] Compiled output missing (dist/). Run `npm ci --include=dev && npm run build` ' +
        'once on this host, or deploy from a repository clone that includes dist/.',
    );
    process.exit(1);
  }
  throw err;
}
