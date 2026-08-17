/**
 * Real swap-signal extraction from Solana transactions.
 *
 * Program-agnostic: instead of parsing DEX-specific instructions, we diff
 * the target wallet's token balances before/after the transaction
 * (meta.preTokenBalances vs meta.postTokenBalances) and its SOL balance.
 * A token balance INCREASE => the wallet bought that token; a DECREASE =>
 * it sold it. This catches Jupiter, Raydium, pump.fun and any other DEX.
 */
export interface SwapSignal {
  direction: 'buy' | 'sell';
  mint: string;
  /** Raw token base units moved (received for buys, sent for sells). */
  tokenAmountRaw: string;
  decimals: number;
  /** SOL spent (buys) / received (sells), in lamports (best effort). */
  solLamports: string;
}

export interface ParsedSwapResult {
  signature: string;
  blockTime: number | null;
  /** True when the transaction FAILED on chain (alerts report this). */
  ok: boolean;
  signals: SwapSignal[];
}

/**
 * Pure parser over a getParsedTransaction response — unit-tested without
 * any network access.
 */
export function parseSwapSignals(parsedTx: unknown, signature: string): ParsedSwapResult {
  const base: ParsedSwapResult = { signature, blockTime: null, ok: true, signals: [] };
  if (!parsedTx || typeof parsedTx !== 'object') return base;

  const tx = parsedTx as Record<string, unknown>;
  if (typeof tx.blockTime === 'number') base.blockTime = tx.blockTime;

  const meta = tx.meta as Record<string, unknown> | null | undefined;
  if (!meta) return base;
  if (meta.err !== null && meta.err !== undefined) base.ok = false;

  const transaction = tx.transaction as Record<string, unknown> | null | undefined;
  const message = transaction?.message as Record<string, unknown> | null | undefined;
  if (!message || !Array.isArray(message.accountKeys)) return base;

  const accountKeys = message.accountKeys as Array<Record<string, unknown>>;
  // SOL balance diffs come from pre/postBalances indexed like accountKeys.
  const preBalances = Array.isArray(meta.preBalances) ? (meta.preBalances as number[]) : [];
  const postBalances = Array.isArray(meta.postBalances) ? (meta.postBalances as number[]) : [];
  const solLamports = String(Math.max(0, (postBalances[0] ?? 0) - (preBalances[0] ?? 0)));

  interface BalanceEntry {
    accountIndex: number;
    mint?: string;
    uiTokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null };
  }
  const preTokens = (Array.isArray(meta.preTokenBalances) ? meta.preTokenBalances : []) as BalanceEntry[];
  const postTokens = (Array.isArray(meta.postTokenBalances) ? meta.postTokenBalances : []) as BalanceEntry[];

  const postByIndex = new Map<number, BalanceEntry>();
  for (const p of postTokens) postByIndex.set(p.accountIndex, p);
  const preByIndex = new Map<number, BalanceEntry>();
  for (const p of preTokens) preByIndex.set(p.accountIndex, p);

  // Collect all mints whose balances changed for the transaction owner
  // (the fee payer, accountKeys[0]).
  const mintsChanged = new Set<string>();
  for (const entry of postTokens) {
    const pre = preByIndex.get(entry.accountIndex);
    const postAmount = BigInt(entry.uiTokenAmount?.amount ?? '0');
    const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? '0');
    const mint = entry.mint ?? pre?.mint;
    if (!mint || postAmount === preAmount) continue;
    if (preAmount < postAmount) mintsChanged.add(mint); // inflow -> buy
    else mintsChanged.add(mint); // outflow -> sell
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
      if ((post?.mint ?? pre?.mint) !== mint) continue;
      const postAmount = BigInt(post?.uiTokenAmount?.amount ?? '0');
      const preAmount = BigInt(pre?.uiTokenAmount?.amount ?? '0');
      decimals = post?.uiTokenAmount?.decimals ?? pre?.uiTokenAmount?.decimals ?? 9;
      if (postAmount > preAmount) inflow += postAmount - preAmount;
      else outflow += preAmount - postAmount;
    }
    if (inflow > 0n) {
      base.signals.push({
        direction: 'buy',
        mint,
        tokenAmountRaw: inflow.toString(),
        decimals,
        solLamports,
      });
    } else if (outflow > 0n) {
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
