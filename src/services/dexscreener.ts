import type { DexScreenerPair, DexScreenerToken } from "../types/dexscreener.js";
import type {
  DexScreenerServiceResult,
  DexScreenerTokenData,
} from "../types/token-market-data.js";

const DEXSCREENER_API_URL = "https://api.dexscreener.com/token-pairs/v1";
const SOLANA_CHAIN_ID = "solana";

type JsonRecord = Record<string, unknown>;

export type DexScreenerFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseToken(value: unknown): DexScreenerToken | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    address: asString(value.address),
    name: asString(value.name),
    symbol: asString(value.symbol),
  };
}

function parsePair(value: unknown): DexScreenerPair | null {
  if (!isRecord(value)) {
    return null;
  }

  const txns = isRecord(value.txns) && isRecord(value.txns.h24) ? value.txns.h24 : null;
  const volume = isRecord(value.volume) ? value.volume : null;
  const liquidity = isRecord(value.liquidity) ? value.liquidity : null;

  return {
    chainId: asString(value.chainId),
    dexId: asString(value.dexId),
    url: asString(value.url),
    pairAddress: asString(value.pairAddress),
    baseToken: parseToken(value.baseToken),
    quoteToken: parseToken(value.quoteToken),
    priceUsd: asNumber(value.priceUsd),
    txns24h: txns
      ? { buys: asNumber(txns.buys), sells: asNumber(txns.sells) }
      : null,
    volume24h: volume ? asNumber(volume.h24) : null,
    liquidityUsd: liquidity ? asNumber(liquidity.usd) : null,
    fdv: asNumber(value.fdv),
    marketCap: asNumber(value.marketCap),
    pairCreatedAt: asNumber(value.pairCreatedAt),
  };
}

export function parseDexScreenerPairs(value: unknown): DexScreenerPair[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map(parsePair).filter((pair): pair is DexScreenerPair => pair !== null);
}

/**
 * Selects only Solana pairs and returns the highest USD-liquidity pair. Ties
 * preserve DexScreener's response order; pairs without a USD liquidity value
 * rank below pairs with a numeric value.
 */
export function selectRepresentativeSolanaPair(
  pairs: readonly DexScreenerPair[],
): DexScreenerPair | null {
  const solanaPairs = pairs.filter(
    (pair) => pair.chainId?.toLowerCase() === SOLANA_CHAIN_ID,
  );

  if (solanaPairs.length === 0) {
    return null;
  }

  return solanaPairs.reduce((bestPair, candidate) => {
    const bestLiquidity = bestPair.liquidityUsd ?? Number.NEGATIVE_INFINITY;
    const candidateLiquidity = candidate.liquidityUsd ?? Number.NEGATIVE_INFINITY;

    return candidateLiquidity > bestLiquidity ? candidate : bestPair;
  });
}

function findTokenInPair(
  pair: DexScreenerPair,
  tokenAddress: string,
): DexScreenerToken | null {
  const matchesAddress = (token: DexScreenerToken | null): boolean =>
    token?.address === tokenAddress;

  if (matchesAddress(pair.baseToken)) {
    return pair.baseToken;
  }

  return matchesAddress(pair.quoteToken) ? pair.quoteToken : null;
}

export function normalizeDexScreenerTokenData(
  pair: DexScreenerPair,
  tokenAddress: string,
): DexScreenerTokenData {
  const token = findTokenInPair(pair, tokenAddress);

  return {
    chainId: SOLANA_CHAIN_ID,
    tokenAddress,
    symbol: token?.symbol ?? null,
    name: token?.name ?? null,
    priceUsd: pair.priceUsd,
    marketCap: pair.marketCap,
    fdv: pair.fdv,
    liquidityUsd: pair.liquidityUsd,
    volume24h: pair.volume24h,
    buys24h: pair.txns24h?.buys ?? null,
    sells24h: pair.txns24h?.sells ?? null,
    pairCreatedAt: pair.pairCreatedAt,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    url: pair.url,
  };
}

export class DexScreenerService {
  constructor(
    private readonly fetcher: DexScreenerFetcher,
    private readonly timeoutMs = 8_000,
  ) {}

  async getTokenMarketData(tokenAddress: string): Promise<DexScreenerServiceResult> {
    const normalizedAddress = tokenAddress.trim();
    const endpoint = `${DEXSCREENER_API_URL}/${SOLANA_CHAIN_ID}/${encodeURIComponent(normalizedAddress)}`;
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        headers: { Accept: "application/json" },
        signal: abortController.signal,
      });
    } catch {
      return {
        ok: false,
        reason: "network_error",
        detail: abortController.signal.aborted
          ? "The DexScreener request timed out."
          : "Unable to reach the DexScreener API.",
        statusCode: null,
      };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      return {
        ok: false,
        reason: "not_found",
        detail: "DexScreener has no market pairs for this token.",
        statusCode: response.status,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "http_error",
        detail: `DexScreener API request failed with HTTP ${response.status}.`,
        statusCode: response.status,
      };
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "DexScreener returned an unreadable JSON response.",
        statusCode: null,
      };
    }

    const pairs = parseDexScreenerPairs(responseBody);
    if (pairs === null) {
      return {
        ok: false,
        reason: "malformed_response",
        detail: "DexScreener returned an unexpected response shape.",
        statusCode: null,
      };
    }

    const pair = selectRepresentativeSolanaPair(pairs);
    if (pair === null) {
      return {
        ok: false,
        reason: "not_found",
        detail: "DexScreener has no Solana market pairs for this token.",
        statusCode: null,
      };
    }

    return {
      ok: true,
      data: normalizeDexScreenerTokenData(pair, normalizedAddress),
    };
  }
}
