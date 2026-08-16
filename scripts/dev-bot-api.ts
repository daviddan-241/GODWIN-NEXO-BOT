/**
 * Development/verification helper: runs a local Mock Bot API server and
 * drives a few updates through the connected bot so an operator can verify
 * the full startup path (getMe → long polling → handlers) without a real
 * Telegram token.
 *
 * SECURITY: it prints only message metadata and truncated text. It never
 * prints anything from <code> blocks (addresses/keys are masked) and it
 * never triggers secret-revealing flows.
 *
 * Usage (terminal 1):
 *   npx tsx scripts/dev-bot-api.ts
 * Then start the bot with TELEGRAM_API_ROOT pointing at the printed URL.
 */
import { MockBotApiServer } from '../tests/helpers/mock-bot-api';

function maskSecrets(text: string): string {
  // Remove anything inside <code>…</code> so no address/key material is printed.
  return text.replace(/<code>[\s\S]*?<\/code>/g, '<code>[masked]</code>').slice(0, 140);
}

async function main(): Promise<void> {
  const mock = new MockBotApiServer();
  await mock.start();
  mock.logRequests = true;
  console.log(`[dev-bot-api] listening on ${mock.url}`);
  console.log(`[dev-bot-api] set TELEGRAM_API_ROOT=${mock.url}`);

  const chatId = 42_000_001;
  const adminChatId = 42_000_002;

  // Drive a simple flow after the bot connects: /start, then admin /stats.
  setTimeout(() => {
    mock.enqueueText(chatId, '/start', { id: chatId, first_name: 'Operator', username: 'operator' });
    console.log('[dev-bot-api] enqueued /start from test user');
  }, 5000);

  setTimeout(() => {
    mock.enqueueText(adminChatId, '/stats', { id: adminChatId, first_name: 'Admin', username: 'admin' });
    console.log('[dev-bot-api] enqueued /stats from admin chat');
  }, 9000);

  // Log outgoing messages (metadata + masked text).
  const seen = new Set<number>();
  setInterval(() => {
    for (let i = seen.size; i < mock.outgoing.length; i++) {
      const m = mock.outgoing[i];
      seen.add(i);
      if (m.method === 'sendMessage' && m.text) {
        console.log(`[dev-bot-api] OUT sendMessage -> chat ${m.chat_id}: ${maskSecrets(m.text)}`);
      } else if (m.method === 'getUpdates') {
        // noisy; skip
      } else {
        console.log(`[dev-bot-api] OUT ${m.method} -> chat ${m.chat_id}`);
      }
    }
  }, 1000);

  // Keep running until killed.
  await new Promise(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
