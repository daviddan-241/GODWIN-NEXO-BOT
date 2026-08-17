"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOT_PRIVATE_TEXT = exports.ERROR_PREFIX = void 0;
exports.transition = transition;
exports.resetToIdle = resetToIdle;
exports.isPrivateChat = isPrivateChat;
exports.requirePrivate = requirePrivate;
exports.answerCallback = answerCallback;
exports.safeHandler = safeHandler;
exports.networkLabel = networkLabel;
const session_1 = require("../session");
const format_1 = require("../../util/format");
exports.ERROR_PREFIX = 'Something went wrong:';
exports.NOT_PRIVATE_TEXT = 'This bot works in private chats. Open a chat with the bot to use it.';
async function transition(ctx, state, payload = {}) {
    ctx.session.state = state;
    ctx.session.payload = payload;
}
async function resetToIdle(ctx) {
    ctx.session.state = session_1.IDLE_STATE;
    ctx.session.payload = {};
}
/** True when the update came from a private (1:1) chat with the bot. */
function isPrivateChat(ctx) {
    return ctx.chat?.type === 'private';
}
async function requirePrivate(ctx) {
    if (isPrivateChat(ctx))
        return true;
    await ctx.reply(exports.NOT_PRIVATE_TEXT);
    return false;
}
async function answerCallback(ctx, text) {
    // Safe for handlers that are reachable both from inline buttons and
    // slash commands (no callback_query exists in the latter case).
    if (!ctx.callbackQuery?.id)
        return;
    await ctx.answerCallbackQuery({ text, show_alert: false }).catch(() => undefined);
}
/**
 * Wraps every handler: logs, records a structured error event (with a
 * trace/reference ID, never secrets) and replies to the user with the
 * (non-secret) error message plus the reference ID.
 */
function safeHandler(name, fn) {
    return async (ctx, ...args) => {
        try {
            await fn(ctx, ...args);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ctx.services.logger.error({ handler: name, chatId: ctx.chat?.id, err: message }, 'handler error');
            // Structured error event: event type, user (if applicable), SAFE
            // message, timestamp, trace/reference ID. Never includes secrets.
            const traceId = await ctx.services.notifier
                .event('error', {
                eventType: `handler:${name}`,
                user: ctx.chat?.id ?? null,
                safeMessage: message,
            })
                .catch(() => 'n/a');
            try {
                await ctx.reply(`${exports.ERROR_PREFIX} ${(0, format_1.escapeHtml)(message)}\nReference: <code>${traceId}</code>`, { parse_mode: 'HTML' });
            }
            catch {
                // reply may fail if the update was a stale callback; nothing to do
            }
            // NOTE: the conversation state is intentionally left as-is so users
            // can retry the failed step (e.g. paste a valid mnemonic again).
            // Handlers that must abort set the state themselves; /cancel resets.
        }
    };
}
function networkLabel(ctx) {
    return ctx.services.config.isDevnet ? 'Devnet' : 'Mainnet';
}
//# sourceMappingURL=common.js.map