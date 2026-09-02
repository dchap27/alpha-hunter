import type { DexScreenerServiceResult, DexScreenerTokenData } from "./token-market-data.js";

export interface AnalysisSignal extends Record<string, unknown> {
  type: string;
  severity: "info" | "warning";
  message: string;
}

export interface TokenAnalysis extends Record<string, unknown> {
  analysisVersion: "0.1";
  token: DexScreenerTokenData;
  metrics: {
    liquidityToMarketCap: number | null;
    volumeToLiquidity: number | null;
    buySellRatio: number | null;
  };
  dataQuality: {
    completenessScore: number;
    missingFields: string[];
  };
  signals: AnalysisSignal[];
}

/** Failure cases are passed through unchanged from the provider service. */
export type TokenAnalysisEngineResult =
  | { ok: true; data: TokenAnalysis }
  | Extract<DexScreenerServiceResult, { ok: false }>;
