/** A normalized market snapshot from the DexScreener provider. */
export interface DexScreenerTokenData extends Record<string, unknown> {
  chainId: "solana";
  tokenAddress: string;
  symbol: string | null;
  name: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairCreatedAt: number | null;
  dexId: string | null;
  pairAddress: string | null;
  url: string | null;
}

/**
 * Typed provider result. MCP consumers never need to infer an error from an
 * exception or inspect provider-specific response bodies.
 */
export type DexScreenerServiceResult =
  | { ok: true; data: DexScreenerTokenData }
  | {
      ok: false;
      reason: "not_found" | "http_error" | "malformed_response" | "network_error";
      detail: string;
      statusCode: number | null;
    };
