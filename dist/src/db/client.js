"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDatabase = createDatabase;
exports.pingDatabase = pingDatabase;
/**
 * Database client: a PostgreSQL pool + drizzle instance.
 * The pool is shared across the whole process.
 */
const pg_1 = require("pg");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const schema = __importStar(require("./schema"));
function createDatabase(databaseUrl) {
    const pool = new pg_1.Pool({
        connectionString: databaseUrl,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => {
        // Prevent the process from crashing on idle client errors; the query
        // that triggered it will surface the error to its own caller.
        console.error(`[db] idle client error: ${err.message}`);
    });
    return { pool, db: (0, node_postgres_1.drizzle)(pool, { schema }) };
}
/** One-shot connectivity check (used by the health server and scripts). */
async function pingDatabase(database) {
    await database.pool.query('SELECT 1');
}
//# sourceMappingURL=client.js.map