"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySessionStore = exports.DbSessionStore = exports.IDLE_STATE = void 0;
exports.IDLE_STATE = 'idle';
class DbSessionStore {
    repos;
    constructor(repos) {
        this.repos = repos;
    }
    async get(chatId) {
        const s = await this.repos.getSession(chatId);
        return {
            state: s.state,
            payload: (s.payload ?? {}),
            updatedAt: s.updatedAt ?? new Date(),
        };
    }
    async save(chatId, session) {
        await this.repos.saveSession({ chatId, state: session.state, payload: session.payload });
    }
    async reset(chatId) {
        await this.repos.resetSession(chatId);
    }
}
exports.DbSessionStore = DbSessionStore;
/** In-memory store — used by unit tests that run without a database. */
class MemorySessionStore {
    map = new Map();
    async get(chatId) {
        return this.map.get(chatId) ?? { state: exports.IDLE_STATE, payload: {}, updatedAt: new Date() };
    }
    async save(chatId, session) {
        this.map.set(chatId, { ...session, payload: { ...session.payload }, updatedAt: new Date() });
    }
    async reset(chatId) {
        this.map.delete(chatId);
    }
}
exports.MemorySessionStore = MemorySessionStore;
//# sourceMappingURL=session.js.map