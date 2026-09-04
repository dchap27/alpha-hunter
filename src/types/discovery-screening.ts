import type { TokenDiscoveryCandidate, TokenDiscoveryResult } from "./token-discovery.js";
import type { DexScreenerServiceResult, DexScreenerTokenData } from "./token-market-data.js";

export interface CandidateSource {
  getCandidates(): Promise<TokenDiscoveryResult>;
}

export interface ScreenedDiscoveryCandidate extends Record<string, unknown>, Pick<DexScreenerTokenData, "tokenAddress" | "chainId" | "symbol" | "name" | "pairAddress" | "dexId" | "priceUsd" | "liquidityUsd" | "volume24h" | "pairCreatedAt" | "url"> {
  reasons: string[];
}

export interface DiscoveryScreeningData extends Record<string, unknown> {
  candidates: ScreenedDiscoveryCandidate[];
  candidateSource: "dexscreener_profiles_and_boosts";
  limitations: string[];
}

export type DiscoveryScreeningResult =
  | { ok: true; data: DiscoveryScreeningData }
  | { ok: false; reason: "error"; detail: string; statusCode: number | null };

export type DiscoveryEnrichmentResult = DexScreenerServiceResult;
export type DiscoveryIdentityCandidate = TokenDiscoveryCandidate;
