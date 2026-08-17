"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionSolanaClient = void 0;
/**
 * Real Solana RPC client backed by @solana/web3.js `Connection`.
 *
 * All blockchain data flows through here. There is no simulation anywhere:
 * balances, token accounts, mint info, transactions and confirmations all
 * come from a live RPC endpoint (devnet by default, mainnet only with the
 * explicit mainnet gate enabled — see config/env.ts and trading/safety.ts).
 */
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const retry_1 = require("../util/retry");
const swap_signals_1 = require("./swap-signals");
class ConnectionSolanaClient {
    options;
    connection;
    constructor(options) {
        this.options = options;
        this.connection = new web3_js_1.Connection(options.rpcUrl, {
            commitment: options.commitment,
            confirmTransactionInitialTimeout: 90_000,
        });
    }
    async getHealth() {
        // Direct JSON-RPC getHealth call (Connection.getHealth is not exposed
        // in this web3.js line; the raw RPC call is equivalent).
        const res = await fetch(this.options.rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok)
            throw new Error(`RPC getHealth failed: HTTP ${res.status}`);
        const body = (await res.json());
        if (body.error)
            throw new Error(`RPC getHealth failed: ${body.error.message ?? 'unknown'}`);
        if (body.result !== 'ok')
            throw new Error(`RPC getHealth returned: ${body.result ?? 'empty'}`);
        return body.result;
    }
    async getBalance(pubkey) {
        return this.connection.getBalance(new web3_js_1.PublicKey(pubkey));
    }
    async getParsedTokenAccountsByOwner(owner) {
        const res = await (0, retry_1.retryWithBackoff)(() => this.connection.getParsedTokenAccountsByOwner(new web3_js_1.PublicKey(owner), { programId: spl_token_1.TOKEN_PROGRAM_ID }, this.options.commitment), { retries: 3, onRetry: (err, attempt) => {
                // network hiccups are common; retried silently at debug level
                void err;
                void attempt;
            } });
        return res.value.map((item) => {
            const info = item.account.data.parsed.info;
            return {
                mint: info.mint,
                amount: info.tokenAmount.amount,
                decimals: info.tokenAmount.decimals,
                uiAmount: info.tokenAmount.uiAmount,
                account: item.pubkey.toBase58(),
            };
        });
    }
    async getMintInfo(mint) {
        const pubkey = new web3_js_1.PublicKey(mint);
        const account = await this.connection.getParsedAccountInfo(pubkey);
        const data = account.value?.data;
        if (!data || Buffer.isBuffer(data)) {
            throw new Error(`Address is not an SPL token mint: ${mint}`);
        }
        if (data.program !== 'spl-token' || !('parsed' in data)) {
            throw new Error(`Address is not an SPL token mint: ${mint}`);
        }
        const parsed = data.parsed;
        if (parsed.type !== 'mint' || !parsed.info) {
            throw new Error(`Address is not an SPL token mint: ${mint}`);
        }
        return {
            decimals: parsed.info.decimals ?? 0,
            isInitialized: parsed.info.isInitialized ?? true,
        };
    }
    async getAccountInfo(address) {
        const info = await this.connection.getAccountInfo(new web3_js_1.PublicKey(address));
        return { exists: info !== null };
    }
    async sendAndConfirmTransaction(tx, signers = []) {
        let signature;
        if (tx instanceof web3_js_1.VersionedTransaction) {
            signature = await this.connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: false,
                maxRetries: 3,
            });
        }
        else {
            signature = await this.connection.sendTransaction(tx, signers, {
                skipPreflight: false,
                maxRetries: 3,
            });
        }
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.options.commitment);
        const confirmation = await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, this.options.commitment);
        if (confirmation.value.err) {
            throw new Error(`Transaction failed to confirm: ${JSON.stringify(confirmation.value.err)}`);
        }
        return signature;
    }
    async getLatestBlockhash() {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.options.commitment);
        return { blockhash, lastValidBlockHeight };
    }
    async getSlot() {
        return this.connection.getSlot(this.options.commitment);
    }
    async getSwapSignals(signature) {
        try {
            const parsed = await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: this.options.commitment,
            });
            if (!parsed)
                return null;
            return (0, swap_signals_1.parseSwapSignals)(parsed, signature);
        }
        catch {
            return null; // best-effort
        }
    }
    async getRecentSignatures(address, limit = 5) {
        const res = await this.connection.getSignaturesForAddress(new web3_js_1.PublicKey(address), { limit }, this.options.commitment);
        return res.map((item) => ({
            signature: item.signature,
            err: item.err ? true : null,
        }));
    }
    async getTransactionSender(signature, selfAddress) {
        try {
            const parsed = await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
                commitment: this.options.commitment,
            });
            const message = parsed?.transaction?.message;
            if (!message || !('accountKeys' in message))
                return null;
            const keys = message.accountKeys;
            const toBase58 = (p) => {
                if (typeof p === 'string')
                    return p;
                if (p && typeof p === 'object' && 'toBase58' in p) {
                    return p.toBase58();
                }
                return null;
            };
            // The fee payer is the first account key; prefer the first external
            // signer when the fee payer is the wallet itself.
            const first = keys[0] ? toBase58(keys[0].pubkey) : null;
            if (first && first !== selfAddress)
                return first;
            for (const key of keys) {
                if (!key.signer)
                    continue;
                const pub = toBase58(key.pubkey);
                if (pub && pub !== selfAddress)
                    return pub;
            }
            return null;
        }
        catch {
            return null; // best-effort only
        }
    }
}
exports.ConnectionSolanaClient = ConnectionSolanaClient;
//# sourceMappingURL=client.js.map