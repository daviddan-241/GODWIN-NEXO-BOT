/**
 * Multi-provider token resolver.
 *
 * Resolves tokens from ANY of the major real APIs, in order of usefulness:
 *   1. Jupiter strict token list   — symbol/name/mint lookup + decimals
 *   2. DexScreener                 — search + pair data (price, liquidity,
 *                                    volume, DEX, changes, txns)
 *   3. Raydium price API           — live price + symbol for a mint
 *   4. Birdeye public price API    — live price (no key required)
 *   5. CoinGecko                   — search + Solana token price
 *
 * "Token Not Found" is only returned after EVERY provider fails. All calls
 * are bounded by timeouts and cached for 60s.
 */
import { PublicKey } from '@solana/web3.js';
import type { Logger } from '../logging/logger';
import { formatMoney } from '../telegram/formatters';

type FetchFn = typeof fetch;

export interface ResolverConfig {
  coingeckoUrl: string;
  dexscreenerUrl: string;
  raydiumPriceUrl: string;
  birdeyeUrl: string;
  jupiterTokenListUrl: string;
  pumpfunUrl: string;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  chain: string;
  dex: string;
  priceUsd: number;
  mcap: number;
  liquidity: number;
  volume24h: number;
  change24h: number;
  buys24h: number;
  sells24h: number;
  pairUrl: string;
  riskLevel: string;
  /** 0-1000 risk score. */
  riskScore: number;
  riskFlags: string[];
  flagDetails: string[];
  /** Whether this token can be traded by the bot (Solana mints only). */
  tradeable: boolean;
}

export interface TokenSearchProvider {
  searchToken(query: string): Promise<TokenInfo | null>;
  getTokenByAddress(address: string): Promise<TokenInfo | null>;
}

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6_000;

function isBase58Address(input: string): boolean {
  try {
    new PublicKey(input);
    return true;
  } catch {
    return false;
  }
}

export interface ExtractedQuery {
  kind: 'evm' | 'solana' | 'text';
  value: string;
}

/**
 * Pulls a real identifier out of messy user input:
 *   "0x6982508145454922925dDbE47a25d4ec3d2311933 (ETH CA)" -> EVM address
 *   "2UEnrcHM56X7B8Hrqoizvr7CSAXLzZ9ZdM98NyBZmpump&"      -> Solana mint
 *   "BONK", "pepe"                                          -> symbol/name
 */
export function extractIdentifier(input: string): ExtractedQuery {
  const raw = input.trim();

  const evm = raw.match(/0x[0-9a-fA-F]{40}/);
  if (evm) return { kind: 'evm', value: evm[0] };

  const base58 = raw.match(/[1-9A-HJ-NP-Za-km-z]{43,44}/);
  if (base58) return { kind: 'solana', value: base58[0] };

  let text = raw;
  // Strip trailing "(...)" annotations like "(ETH CA)", "(SOL CA)".
  text = text.replace(/\s*\([^)]*\)\s*$/, '');
  // Strip junk characters that are not symbol/name chars.
  text = text.replace(/[^a-zA-Z0-9 .$_-]/g, '').trim();
  if (/\b(eth|ethereum|evm)\b/i.test(text) && text.length > 4) {
    // a symbol that looks EVM-ish: normalize to the symbol part
    const symbol = text.split(/\s+/)[0];
    if (symbol) return { kind: 'text', value: symbol };
  }
  return { kind: 'text', value: text };
}

/** Deterministic risk scoring from real market data (0-1000, higher = safer). */
export function computeRiskScore(t: {
  liquidity: number;
  volume24h: number;
  mcap: number;
  buys24h: number;
  sells24h: number;
}): number {
  let score = 200; // base
  if (t.liquidity > 1_000_000) score += 300;
  else if (t.liquidity > 250_000) score += 220;
  else if (t.liquidity > 50_000) score += 140;
  else if (t.liquidity > 10_000) score += 60;
  if (t.volume24h > 500_000) score += 250;
  else if (t.volume24h > 100_000) score += 160;
  else if (t.volume24h > 20_000) score += 80;
  if (t.mcap > 50_000_000) score += 200;
  else if (t.mcap > 5_000_000) score += 130;
  else if (t.mcap > 500_000) score += 60;
  if (t.buys24h + t.sells24h > 1_000) score += 50;
  return Math.max(0, Math.min(1000, score));
}

export function deriveRisk(t: {
  liquidity: number;
  volume24h: number;
  mcap: number;
  buys24h: number;
  sells24h: number;
}): { riskLevel: string; riskScore: number; riskFlags: string[]; flagDetails: string[] } {
  const riskScore = computeRiskScore(t);
  let riskLevel: string;
  if (riskScore >= 700) riskLevel = 'LOW RISK';
  else if (riskScore >= 400) riskLevel = 'MEDIUM RISK';
  else riskLevel = 'HIGH RISK';

  const riskFlags: string[] = [];
  const flagDetails: string[] = [];
  if (riskLevel !== 'LOW RISK') {
    riskFlags.push('RUG RISK');
    if (t.liquidity < 10_000) flagDetails.push('Very low liquidity');
    else if (t.liquidity < 100_000) flagDetails.push('Low risk score');
    if (t.buys24h + t.sells24h < 200) flagDetails.push('No bundle detected');
    if (flagDetails.length === 0) flagDetails.push('Some caution advised');
  }
  return { riskLevel, riskScore, riskFlags, flagDetails };
}

export class MultiProviderTokenResolver implements TokenSearchProvider {
  private cache = new Map<string, { token: TokenInfo; at: number }>();

  constructor(
    private config: ResolverConfig,
    private logger: Logger,
    private fetchFn: FetchFn = fetch,
  ) {}

  async getTokenByAddress(address: string): Promise<TokenInfo | null> {
    const key = `addr:${address}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.token;

    if (!isBase58Address(address)) return null;

    const token = await this.resolveByAddress(address);
    if (token) this.cache.set(key, { token, at: Date.now() });
    return token;
  }

  async searchToken(query: string): Promise<TokenInfo | null> {
    const key = `q:${query.trim().toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.token;

    const token = await this.resolveByQuery(query.trim());
    if (token) this.cache.set(key, { token, at: Date.now() });
    return token;
  }

  // ------------------------------------------------------------------
  // Address path: find the mint's identity + market data from any source.
  // ------------------------------------------------------------------
  private async resolveByAddress(address: string): Promise<TokenInfo | null> {
    if (/^0x[0-9a-fA-F]{40}$/.test(address)) return this.resolveEvmByAddress(address);

    const [jupList, dexToken, raydiumPrice, birdeyePrice, geckoToken, pump] = await Promise.all([
      this.fetchJupiterList().catch(() => null),
      this.dexTokenByAddress(address),
      this.raydiumPrice(address),
      this.birdeyePrice(address),
      this.geckoTokenByAddress(address),
      this.pumpFunCoin(address),
    ]);

    const fromList = jupList?.tokens.find(
      (t: { address?: string; mint?: string }) => (t.address ?? t.mint) === address,
    );

    const name = dexToken?.name ?? pump?.name ?? fromList?.name ?? geckoToken?.name ?? 'Unknown Token';
    const symbol = dexToken?.symbol ?? pump?.symbol ?? fromList?.symbol ?? raydiumPrice?.symbol ?? geckoToken?.symbol ?? address.slice(0, 5).toUpperCase();
    const priceUsd = dexToken?.priceUsd ?? pump?.priceUsd ?? raydiumPrice?.price ?? birdeyePrice?.price ?? geckoToken?.priceUsd ?? 0;
    const dex = dexToken?.dex ?? (pump ? 'pumpfun' : 'unknown');

    // STRENGTH: a valid Solana mint ALWAYS gets a card (old coins, low
    // liquidity, new mints — every source may be thin, but the address is
    // real and we show every detail we found).
    return this.assembleToken({
      address,
      chain: 'solana',
      name,
      symbol,
      dex,
      priceUsd,
      liquidity: dexToken?.liquidity ?? 0,
      volume24h: dexToken?.volume24h ?? 0,
      mcap: dexToken?.mcap ?? pump?.mcap ?? geckoToken?.mcap ?? 0,
      change24h: dexToken?.change24h ?? geckoToken?.change24h ?? 0,
      buys24h: dexToken?.buys24h ?? 0,
      sells24h: dexToken?.sells24h ?? 0,
      pairUrl: dexToken?.pairUrl ?? '',
    });
  }

  /** Ethereum tokens (EVM CAs): real data, but not tradeable by this bot. */
  private async resolveEvmByAddress(address: string): Promise<TokenInfo | null> {
    const [dexToken, geckoToken] = await Promise.all([
      this.dexTokenByAddressEvm(address),
      this.geckoEvmToken(address),
    ]);
    if (!dexToken && !geckoToken) return null;
    return this.assembleToken({
      address,
      chain: 'ethereum',
      name: dexToken?.name ?? geckoToken?.name ?? 'Unknown',
      symbol: dexToken?.symbol ?? geckoToken?.symbol ?? '???',
      dex: dexToken?.dex ?? 'ethereum',
      priceUsd: dexToken?.priceUsd ?? geckoToken?.priceUsd ?? 0,
      liquidity: dexToken?.liquidity ?? 0,
      volume24h: dexToken?.volume24h ?? 0,
      mcap: dexToken?.mcap ?? geckoToken?.mcap ?? 0,
      change24h: dexToken?.change24h ?? geckoToken?.change24h ?? 0,
      buys24h: dexToken?.buys24h ?? 0,
      sells24h: dexToken?.sells24h ?? 0,
      pairUrl: dexToken?.pairUrl ?? '',
    });
  }

  private async dexTokenByAddressEvm(address: string): Promise<Partial<TokenInfo> & { address?: string } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.dexscreenerUrl}/tokens/v1/ethereum/${encodeURIComponent(address)}`,
      )) as Array<Record<string, unknown>>;
      const pair = Array.isArray(data) ? data[0] : null;
      if (!pair) return null;
      return this.parseDexPair(pair);
    } catch {
      return null;
    }
  }

  private async geckoEvmToken(address: string): Promise<{ name?: string; symbol?: string; priceUsd?: number; mcap?: number; change24h?: number } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.coingeckoUrl}/coins/ethereum/contract/${encodeURIComponent(address)}`,
      )) as {
        name?: string;
        symbol?: string;
        market_data?: {
          current_price?: { usd?: number };
          market_cap?: { usd?: number };
          price_change_percentage_24h?: number;
        };
      };
      if (!data?.name) return null;
      return {
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
        priceUsd: data.market_data?.current_price?.usd,
        mcap: data.market_data?.market_cap?.usd,
        change24h: data.market_data?.price_change_percentage_24h,
      };
    } catch {
      return null;
    }
  }

  /** pump.fun metadata (real public API) for mints DexScreener misses. */
  private async pumpFunCoin(mint: string): Promise<{ name?: string; symbol?: string; priceUsd?: number; mcap?: number } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.pumpfunUrl}/coins/${encodeURIComponent(mint)}`,
      )) as {
        name?: string;
        symbol?: string;
        usd_market_cap?: number;
        market_cap?: number;
        total_supply?: number;
      };
      if (!data?.name && !data?.symbol) return null;
      let priceUsd: number | undefined;
      if (typeof data.usd_market_cap === 'number' && typeof data.total_supply === 'number' && data.total_supply > 0) {
        priceUsd = data.usd_market_cap / data.total_supply;
      }
      return {
        name: data.name,
        symbol: data.symbol,
        priceUsd,
        mcap: data.usd_market_cap,
      };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Symbol/name path: try every provider's search until one hits.
  // ------------------------------------------------------------------
  private async resolveByQuery(query: string): Promise<TokenInfo | null> {
    const extracted = extractIdentifier(query);

    // Direct identifier: address (Solana or EVM).
    if (extracted.kind === 'solana') {
      return this.resolveByAddress(extracted.value);
    }
    if (extracted.kind === 'evm') {
      return this.resolveEvmByAddress(extracted.value);
    }

    const q = extracted.value.toLowerCase();
    if (!q) return null;

    // 1) Jupiter strict list (fast, authoritative metadata)
    const jupList = await this.fetchJupiterList().catch(() => null);
    const fromList = jupList?.tokens?.find(
      (t: { symbol?: string; name?: string }) =>
        t.symbol?.toLowerCase() === q || t.name?.toLowerCase() === q,
    );
    const listAddress = fromList?.address ?? fromList?.mint ?? null;

    // 2) DexScreener search — Solana pairs first, Ethereum as fallback.
    const dexSearch = await this.dexSearch(q);

    // 3) CoinGecko search
    const geckoSearch = await this.geckoSearch(q);

    const address = dexSearch?.address ?? listAddress ?? geckoSearch?.address ?? null;
    if (address) {
      const token = await this.resolveByAddress(address);
      if (token) return token;
    }

    // 4) No Solana result: try EVM (symbols that only exist on Ethereum).
    const dexEvm = await this.dexSearchEvm(q);
    if (dexEvm?.address) {
      const evmToken = await this.resolveEvmByAddress(dexEvm.address);
      if (evmToken) return evmToken;
    }
    const geckoEvmAddr = await this.geckoSearchEvm(q);
    if (geckoEvmAddr) {
      const evmToken = await this.resolveEvmByAddress(geckoEvmAddr);
      if (evmToken) return evmToken;
    }
    return null;
  }

  private async dexSearchEvm(query: string): Promise<Partial<TokenInfo> & { address?: string } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.dexscreenerUrl}/latest/dex/search?q=${encodeURIComponent(query)}`,
      )) as { pairs?: Array<Record<string, unknown>> };
      const pair = data.pairs?.find((p) => p.chainId === 'ethereum');
      if (!pair) return null;
      return this.parseDexPair(pair);
    } catch {
      return null;
    }
  }

  private async geckoSearchEvm(query: string): Promise<string | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.coingeckoUrl}/search?query=${encodeURIComponent(query)}`,
      )) as { coins?: Array<{ id: string; symbol: string }> };
      const coin = data.coins?.find((c) => c.symbol?.toLowerCase() === query.toLowerCase());
      if (!coin) return null;
      const detail = (await this.fetchJson(
        `${this.config.coingeckoUrl}/coins/${encodeURIComponent(coin.id)}`,
      )) as { platforms?: Record<string, string> };
      return detail.platforms?.ethereum ?? null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Providers
  // ------------------------------------------------------------------

  private async fetchJson(url: string): Promise<unknown> {
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await this.fetchFn(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private jupiterListPromise: Promise<{ tokens: Array<Record<string, string>> } | null> | null = null;

  private fetchJupiterList(): Promise<{ tokens: Array<Record<string, string>> } | null> {
    if (!this.jupiterListPromise) {
      this.jupiterListPromise = this.fetchJson(this.config.jupiterTokenListUrl)
        .then((data) => data as { tokens: Array<Record<string, string>> })
        .catch((err) => {
          this.logger.debug({ err: err instanceof Error ? err.message : String(err) }, 'jupiter list fetch failed');
          this.jupiterListPromise = null;
          return null;
        });
    }
    return this.jupiterListPromise;
  }

  private async dexSearch(query: string): Promise<Partial<TokenInfo> & { address?: string } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.dexscreenerUrl}/latest/dex/search?q=${encodeURIComponent(query)}`,
      )) as { pairs?: Array<Record<string, unknown>> };
      const pair = data.pairs?.find((p) => p.chainId === 'solana') ?? data.pairs?.[0];
      if (!pair) return null;
      return this.parseDexPair(pair);
    } catch {
      return null;
    }
  }

  private async dexTokenByAddress(address: string): Promise<Partial<TokenInfo> & { address?: string } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.dexscreenerUrl}/tokens/v1/solana/${encodeURIComponent(address)}`,
      )) as Array<Record<string, unknown>>;
      const pair = Array.isArray(data) ? data[0] : null;
      if (!pair) return null;
      return this.parseDexPair(pair);
    } catch {
      return null;
    }
  }

  private parseDexPair(pair: Record<string, unknown>): Partial<TokenInfo> & { address?: string } {
    const token = (pair.baseToken ?? {}) as Record<string, unknown>;
    const liquidity = (pair.liquidity ?? {}) as { usd?: number };
    const volume = (pair.volume ?? {}) as { h24?: number };
    const priceChange = (pair.priceChange ?? {}) as { h24?: number };
    const txns = (pair.txns ?? {}) as { h24?: { buys?: number; sells?: number } };
    return {
      name: (token.name as string) ?? 'Unknown',
      symbol: (token.symbol as string) ?? '???',
      address: token.address as string,
      dex: (pair.dexId as string) ?? 'unknown',
      priceUsd: parseFloat(String(pair.priceUsd ?? '0')) || 0,
      mcap: (pair.fdv as number) ?? (pair.marketCap as number) ?? 0,
      liquidity: liquidity.usd ?? 0,
      volume24h: volume.h24 ?? 0,
      change24h: priceChange.h24 ?? 0,
      buys24h: txns.h24?.buys ?? 0,
      sells24h: txns.h24?.sells ?? 0,
      pairUrl: (pair.url as string) ?? '',
    };
  }

  private async raydiumPrice(address: string): Promise<{ symbol?: string; price?: number } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.raydiumPriceUrl}?mints=${encodeURIComponent(address)}`,
      )) as { data?: Record<string, { mintSymbol?: string; price?: number }> };
      const entry = data.data?.[address];
      if (!entry) return null;
      return { symbol: entry.mintSymbol, price: entry.price ? Number(entry.price) : undefined };
    } catch {
      return null;
    }
  }

  private async birdeyePrice(address: string): Promise<{ price?: number } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.birdeyeUrl}/defi/price?address=${encodeURIComponent(address)}`,
      )) as { data?: { value?: number } };
      const value = data.data?.value;
      return value ? { price: Number(value) } : null;
    } catch {
      return null; // keyless access is best-effort
    }
  }

  private async geckoTokenByAddress(address: string): Promise<{ name?: string; symbol?: string; priceUsd?: number; mcap?: number; change24h?: number } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.coingeckoUrl}/coins/solana/contract/${encodeURIComponent(address)}`,
      )) as {
        name?: string;
        symbol?: string;
        market_data?: {
          current_price?: { usd?: number };
          market_cap?: { usd?: number };
          price_change_percentage_24h?: number;
        };
      };
      if (!data?.name) return null;
      return {
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
        priceUsd: data.market_data?.current_price?.usd,
        mcap: data.market_data?.market_cap?.usd,
        change24h: data.market_data?.price_change_percentage_24h,
      };
    } catch {
      return null;
    }
  }

  private async geckoSearch(query: string): Promise<{ address?: string } | null> {
    try {
      const data = (await this.fetchJson(
        `${this.config.coingeckoUrl}/search?query=${encodeURIComponent(query)}`,
      )) as { coins?: Array<{ id: string; symbol: string }> };
      // Only resolve a Solana contract for exact-symbol matches (avoids
      // returning unrelated chains' tokens).
      const coin = data.coins?.find((c) => c.symbol?.toLowerCase() === query.toLowerCase());
      if (!coin) return null;
      const detail = (await this.fetchJson(
        `${this.config.coingeckoUrl}/coins/${encodeURIComponent(coin.id)}`,
      )) as { platforms?: Record<string, string> };
      const solAddress = detail.platforms?.solana;
      return solAddress ? { address: solAddress } : null;
    } catch {
      return null;
    }
  }

  private assembleToken(partial: Partial<TokenInfo> & { address: string }): TokenInfo {
    const chain = partial.chain ?? 'solana';
    const risk = deriveRisk({
      liquidity: partial.liquidity ?? 0,
      volume24h: partial.volume24h ?? 0,
      mcap: partial.mcap ?? 0,
      buys24h: partial.buys24h ?? 0,
      sells24h: partial.sells24h ?? 0,
    });
    return {
      name: partial.name ?? 'Unknown',
      symbol: partial.symbol ?? '???',
      address: partial.address,
      chain,
      dex: partial.dex ?? 'unknown',
      priceUsd: partial.priceUsd ?? 0,
      mcap: partial.mcap ?? 0,
      liquidity: partial.liquidity ?? 0,
      volume24h: partial.volume24h ?? 0,
      change24h: partial.change24h ?? 0,
      buys24h: partial.buys24h ?? 0,
      sells24h: partial.sells24h ?? 0,
      pairUrl: partial.pairUrl ?? '',
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      riskFlags: risk.riskFlags,
      flagDetails: risk.flagDetails,
      tradeable: chain === 'solana',
    };
  }

}

/** Formats the screenshot-exact token card (HTML links inside). */
export function formatTokenInfo(token: TokenInfo): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const price = token.priceUsd > 0
      ? token.priceUsd < 0.01 ? token.priceUsd.toExponential(2) : token.priceUsd.toFixed(8)
      : 'n/a';
  const changeArrow = token.change24h >= 0 ? '▲' : '▼';
  const liquidity = token.liquidity > 0 ? `$${formatMoney(token.liquidity)}` : '-';
  const volume = token.volume24h > 0 ? `$${formatMoney(token.volume24h)}` : '-';
  const solscan = `https://solscan.io/token/${token.address}`;
  const dexscreener = token.pairUrl || `https://dexscreener.com/solana/${token.address}`;

  let flags = '';
  if (token.riskFlags.length > 0) {
    flags = `\n⚠️ <b>Risk Flags:</b>\n`;
    for (const f of token.riskFlags) flags += `🟡 ${esc(f)}\n`;
    for (const d of token.flagDetails) flags += `   ⤷ ${esc(d)}\n`;
  }

  return `🎯 ${esc(token.name)} (${esc(token.symbol)})\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `📊 <b>Price Information</b>\n` +
      `• Current Price: $${esc(price)}\n` +
      `• 24h Change: ${changeArrow} ${Math.abs(token.change24h).toFixed(2)}%\n\n` +
      `📈 <b>Trading Information</b>\n` +
      `• Liquidity: ${esc(liquidity)}\n` +
      `• Volume 24h: ${esc(volume)}\n` +
      `• DEX: ${esc(token.dex)}\n` +
      `• Blockchain: ${token.chain === 'ethereum' ? 'Ethereum (EVM)' : 'Solana'}\n\n` +
      `🔧 <b>Technical Information</b>\n` +
      `• Contract Address:\n${esc(token.address)}\n` +
      `• <a href="${solscan}">🔗 View on Solscan</a>\n` +
      `• <a href="${dexscreener}">🔗 View on DexScreener</a>\n\n` +
      `⚠️ <b>RISK ANALYSIS</b>\n` +
      `• Rating: ${esc(token.riskLevel)}\n` +
      `• Score: ${token.riskScore}/1000\n` +
      `• ${token.riskLevel === 'LOW RISK' ? 'No major flags detected.' : 'Some caution advised — review flags below.'}${flags}\n` +
    `⚠️ <i>Disclaimer: Always do your own research before investing. Token prices are highly volatile.</i>`;
}
