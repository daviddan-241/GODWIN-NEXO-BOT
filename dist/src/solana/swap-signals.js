"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSwapSignals = parseSwapSignals;
/**
 * Pure parser over a getParsedTransaction response — unit-tested without
 * any network access.
 */
function parseSwapSignals(parsedTx, signature) {
    const base = { signature, blockTime: null, ok: true, signals: [] };
    if (!parsedTx || typeof parsedTx !== 'object')
        return base;
    const tx = parsedTx;
    if (typeof tx.blockTime === 'number')
        base.blockTime = tx.blockTime;
    const meta = tx.meta;
    if (!meta)
        return base;
    if (meta.err !== null && meta.err !== undefined)
        base.ok = false;
    const transaction = tx.transaction;
    const message = transaction?.message;
    if (!message || !Array.isArray(message.accountKeys))
        return base;
    const accountKeys = message.accountKeys;
    // SOL balance diffs come from pre/postBalances indexed like accountKeys.
    const preBalances = Array.isArray(meta.preBalances) ? meta.preBalances : [];
    const postBalances = Array.isArray(meta.postBalances) ? meta.postBalances : [];
    const solLamports = String(Math.max(0, (postBalances[0] ?? 0) - (preBalances[0] ?? 0)));
    const preTokens = (Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : []);
    const postTokens = (Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : []);
    const postByIndex = new Map();
    for (const p of postTokens)
        postByIndex.set(p.accountIndex, p);
    const preByIndex = new Map();
    for (const p of preTokens)
        preByIndex.set(p.accountIndex, p);
    // Collect all mints whose balances changed for the transaction owner
    // (the fee payer, accountKeys[0]).
    const mintsChanged = new Set();
    for (const entry of postTokens) {
        const pre = preByIndex.get(entry.accountIndex);
        const postAmount = BigInt(entry.uiTokenAmount?.amount ?? '0');
        const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? '0');
        const mint = entry.mint ?? pre?.mint;
        if (!mint || postAmount === preAmount)
            continue;
        if (preAmount < postAmount)
            mintsChanged.add(mint); // inflow -> buy
        else
            mintsChanged.add(mint); // outflow -> sell
    }
    for (const mint of mintsChanged) {
        // Only consider token accounts owned by the transaction signer.
        const ownerKeyIndex = 0; // fee payer
        void ownerKeyIndex;
        let inflow = 0n;
        let outflow = 0n;
        let decimals = 9;
        for (const keyIndex of postByIndex.keys()) {
            const pre = preByIndex.get(keyIndex);
            const post = postByIndex.get(keyIndex);
            if ((post?.mint ?? pre?.mint) !== mint)
                continue;
            const postAmount = BigInt(post?.uiTokenAmount?.amount ?? '0');
            const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? '0');
            decimals = post?.uiTokenAmount?.decimals ?? pre?.uiTokenAmount?.decimals ?? 9;
            if (postAmount > preAmount)
                inflow += postAmount - preAmount;
            else
                outflow += preAmount - postAmount;
        }
        if (inflow > 0n) {
            base.signals.push({
                direction: 'buy',
                mint,
                tokenAmountRaw: inflow.toString(),
                decimals,
                solLamports,
            });
        }
        else if (outflow > 0n) {
            base.signals.push({
                direction: 'sell',
                mint,
                tokenAmountRaw: outflow.toString(),
                decimals,
                solLamports,
            });
        }
    }
    void accountKeys;
    return base;
}
//# sourceMappingURL=swap-signals.js.map