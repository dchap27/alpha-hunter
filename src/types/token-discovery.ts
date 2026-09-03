export type DiscoverySource = "profile" | "boosted_latest" | "boosted_top";

export interface TokenDiscoveryCandidate extends Record<string, unknown> {
  tokenAddress: string;
  chainId: "solana";
  url: string | null;
  description: string | null;
  sourceTypes: DiscoverySource[];
  boostAmount: number | null;
  boostTotalAmount: number | null;
}

export interface TokenDiscoveryData extends Record<string, unknown> {
  candidates: TokenDiscoveryCandidate[];
  sourcesQueried: {
    profile: "ok" | "error" | "skipped";
    boostedLatest: "ok" | "error" | "skipped";
    boostedTop: "ok" | "error" | "skipped";
  };
  limitations: string[];
}

export type TokenDiscoveryResult =
  | { ok: true; data: TokenDiscoveryData }
  | { ok: false; reason: "error"; detail: string; statusCode: number | null };
