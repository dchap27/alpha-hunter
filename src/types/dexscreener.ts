/**
 * The subset of a DexScreener pair response used by Alpha Hunter. These types
 * remain at the provider boundary; consumers use DexScreenerTokenData instead.
 */
export interface DexScreenerToken {
  address: string | null;
  name: string | null;
  symbol: string | null;
}

export interface DexScreenerPair {
  chainId: string | null;
  dexId: string | null;
  url: string | null;
  pairAddress: string | null;
  baseToken: DexScreenerToken | null;
  quoteToken: DexScreenerToken | null;
  priceUsd: number | null;
  txns24h: { buys: number | null; sells: number | null } | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  pairCreatedAt: number | null;
}
