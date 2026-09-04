import type { DexScreenerServiceResult, DexScreenerTokenData } from "./token-market-data.js";

export interface WatchlistEntry extends Record<string, unknown> {
  tokenAddress: string;
  addedAt: number;
  reason: string | null;
}

export type TokenSnapshot = Record<string, unknown> & {
  id: number;
  tokenAddress: string;
  capturedAt: number;
  market: Pick<DexScreenerTokenData, "priceUsd" | "liquidityUsd" | "marketCap" | "fdv" | "volume24h" | "buys24h" | "sells24h" | "pairCreatedAt">;
};

export interface SnapshotComparison extends Record<string, unknown> {
  tokenAddress: string;
  fromSnapshotId: number;
  toSnapshotId: number;
  fromCapturedAt: number;
  toCapturedAt: number;
  changes: {
    pricePct: number | null;
    liquidityPct: number | null;
    marketCapPct: number | null;
    volumePct: number | null;
  };
}

export type ObservationFailure = Extract<DexScreenerServiceResult, { ok: false }> | {
  ok: false;
  reason: "insufficient_data" | "storage_error";
  detail: string;
  statusCode: number | null;
};
