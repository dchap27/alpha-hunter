import type { HeliusServiceResult } from "./helius.js";
import type { HeliusTokenAccountsResult } from "./helius-token-accounts.js";

export interface RiskSignal extends Record<string, unknown> {
  type: string;
  severity: "info" | "warning";
  message: string;
}

export interface TokenRiskAssessment extends Record<string, unknown> {
  assessmentVersion: "0.1";
  tokenAddress: string;
  authority: {
    mintAuthorityRevoked: boolean | null;
    freezeAuthorityRevoked: boolean | null;
  };
  concentration: {
    top10Percentage: number | null;
    largestTokenAccountPercentage: number | null;
  };
  signals: RiskSignal[];
  limitations: string[];
}

export type TokenRiskResult =
  | { ok: true; data: TokenRiskAssessment }
  | { ok: false; reason: "error"; detail: string; statusCode: number | null }
  | Extract<HeliusServiceResult, { ok: false }>
  | Extract<HeliusTokenAccountsResult, { ok: false }>;
