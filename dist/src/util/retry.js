"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryWithBackoff = retryWithBackoff;
exports.sleep = sleep;
exports.withTimeout = withTimeout;
async function retryWithBackoff(fn, options = {}) {
    const { retries = 3, baseDelayMs = 300, factor = 2, maxDelayMs = 10_000, onRetry, } = options;
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt === retries)
                break;
            const delay = Math.min(baseDelayMs * Math.pow(factor, attempt), maxDelayMs);
            const jittered = delay + Math.floor(Math.random() * (delay * 0.3));
            onRetry?.(err, attempt + 1);
            await sleep(jittered);
        }
    }
    throw lastError;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Runs `fn` but rejects if it does not settle within `ms`. */
function withTimeout(fn, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        fn()
            .then((v) => {
            clearTimeout(timer);
            resolve(v);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
//# sourceMappingURL=retry.js.map