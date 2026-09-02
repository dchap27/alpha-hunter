import { HIGH_VOLUME_TO_LIQUIDITY_RATIO } from "../config/analysisThresholds.js";
import type { DexScreenerServiceResult, DexScreenerTokenData } from "../types/token-market-data.js";
import type {
  AnalysisSignal,
  TokenAnalysis,
  TokenAnalysisEngineResult,
} from "../types/token-analysis.js";

import { safeDivide } from "./safeDivide.js";

const COMPLETENESS_FIELDS = [
  "priceUsd",
  "marketCap",
  "liquidityUsd",
  "volume24h",
  "buys24h",
  "sells24h",
  "pairCreatedAt",
  "dexId",
] as const satisfies readonly (keyof DexScreenerTokenData)[];

export function getDataQuality(token: DexScreenerTokenData): TokenAnalysis["dataQuality"] {
  const missingFields = COMPLETENESS_FIELDS.filter((field) => token[field] === null);

  return {
    completenessScore: ((COMPLETENESS_FIELDS.length - missingFields.length) / COMPLETENESS_FIELDS.length) * 100,
    missingFields: [...missingFields],
  };
}

export function generateAnalysisSignals(
  token: DexScreenerTokenData,
  metrics: TokenAnalysis["metrics"],
): AnalysisSignal[] {
  const signals: AnalysisSignal[] = [];

  if (token.liquidityUsd === null) {
    signals.push({
      type: "liquidity_unavailable",
      severity: "warning",
      message: "Liquidity data is unavailable.",
    });
  }

  if (token.marketCap === null) {
    signals.push({
      type: "market_cap_unavailable",
      severity: "warning",
      message: "Market cap data is unavailable.",
    });
  }

  if (token.volume24h === null) {
    signals.push({
      type: "volume_unavailable",
      severity: "warning",
      message: "24-hour volume data is unavailable.",
    });
  }

  if (token.buys24h === null || token.sells24h === null) {
    signals.push({
      type: "buy_sell_activity_unavailable",
      severity: "warning",
      message: "24-hour buy/sell activity data is unavailable.",
    });
  }

  if (
    metrics.liquidityToMarketCap === null &&
    metrics.volumeToLiquidity === null &&
    metrics.buySellRatio === null
  ) {
    signals.push({
      type: "ratios_unavailable",
      severity: "info",
      message: "No valid ratio could be calculated from the available data.",
    });
  }

  if (
    metrics.volumeToLiquidity !== null &&
    metrics.volumeToLiquidity > HIGH_VOLUME_TO_LIQUIDITY_RATIO
  ) {
    signals.push({
      type: "high_volume_to_liquidity",
      severity: "info",
      message: "24-hour trading activity is high relative to available liquidity.",
    });
  }

  return signals;
}

export function analyzeDexScreenerResult(
  result: DexScreenerServiceResult,
): TokenAnalysisEngineResult {
  if (!result.ok) {
    return result;
  }

  const token = result.data;
  const metrics: TokenAnalysis["metrics"] = {
    liquidityToMarketCap: safeDivide(token.liquidityUsd, token.marketCap),
    volumeToLiquidity: safeDivide(token.volume24h, token.liquidityUsd),
    buySellRatio: safeDivide(token.buys24h, token.sells24h),
  };

  return {
    ok: true,
    data: {
      analysisVersion: "0.1",
      token,
      metrics,
      dataQuality: getDataQuality(token),
      signals: generateAnalysisSignals(token, metrics),
    },
  };
}
