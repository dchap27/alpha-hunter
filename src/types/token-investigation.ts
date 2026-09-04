import type { TokenAnalysis } from "./token-analysis.js";
import type { HeliusTokenData } from "./helius.js";
import type { DexScreenerTokenData } from "./token-market-data.js";
import type { TokenRiskAssessment } from "./token-risk.js";

export interface TokenObservationSummary extends Record<string, unknown> {
  onWatchlist: boolean;
  addedAt: number | null;
  snapshotCount: number;
  earliestSnapshotAt: number | null;
  latestSnapshotAt: number | null;
}

export interface TokenInvestigationReport extends Record<string, unknown> {
  tokenAddress: string;
  status: "ok" | "not_found" | "error";
  market: DexScreenerTokenData | null;
  analysis: TokenAnalysis | null;
  onchain: HeliusTokenData | null;
  risk: TokenRiskAssessment | null;
  observation: TokenObservationSummary;
  limitations: string[];
}
