import {
  DEFAULT_SCREENING_LIMIT,
  MAX_CANDIDATES_TO_ENRICH,
  MAX_PAIR_AGE_MS,
  MAX_SCREENING_LIMIT,
  MIN_LIQUIDITY_USD,
  MIN_VOLUME_24H_USD,
} from "../config/discoveryThresholds.js";
import type { DexScreenerServiceResult } from "../types/token-market-data.js";
import type {
  CandidateSource,
  DiscoveryScreeningResult,
  ScreenedDiscoveryCandidate,
} from "../types/discovery-screening.js";

interface MarketService {
  getTokenMarketData(tokenAddress: string): Promise<DexScreenerServiceResult>;
}

const now = (): number => Date.now();

export async function screenDiscoveryCandidates(
  source: CandidateSource,
  marketService: MarketService,
  options: { limit?: number | undefined } = {},
  nowMs = now(),
): Promise<DiscoveryScreeningResult> {
  const sourceResult = await source.getCandidates();
  if (!sourceResult.ok) return { ok: false, reason: "error", detail: "The discovery candidate source failed.", statusCode: sourceResult.statusCode };

  const candidatesToEnrich = sourceResult.data.candidates.slice(0, MAX_CANDIDATES_TO_ENRICH);
  const enriched = await Promise.all(candidatesToEnrich.map(async (candidate) => ({
    candidate,
    result: await marketService.getTokenMarketData(candidate.tokenAddress),
  })));
  const successful: ScreenedDiscoveryCandidate[] = [];
  let enrichmentFailures = 0;
  let missingPairAge = 0;
  let filteredOut = 0;

  for (const { candidate, result } of enriched) {
    if (!result.ok) {
      enrichmentFailures += 1;
      continue;
    }
    const token = result.data;
    const reasons: string[] = [];
    if (token.liquidityUsd !== null && token.liquidityUsd >= MIN_LIQUIDITY_USD) reasons.push("liquidity_requirement_met");
    if (token.volume24h !== null && token.volume24h >= MIN_VOLUME_24H_USD) reasons.push("volume_requirement_met");
    if (token.pairCreatedAt !== null) {
      if (nowMs - token.pairCreatedAt <= MAX_PAIR_AGE_MS) reasons.push("recent_pair");
    } else {
      missingPairAge += 1;
      reasons.push("pair_age_not_evaluated");
    }
    const liquidityPasses = token.liquidityUsd === null || token.liquidityUsd >= MIN_LIQUIDITY_USD;
    const volumePasses = token.volume24h === null || token.volume24h >= MIN_VOLUME_24H_USD;
    const agePasses = token.pairCreatedAt === null || nowMs - token.pairCreatedAt <= MAX_PAIR_AGE_MS;
    if (!liquidityPasses || !volumePasses || !agePasses) {
      filteredOut += 1;
      continue;
    }
    // Ranking is auditable and non-composite: newest pair first, then liquidity,
    // then volume, with token address as a stable final tie-breaker.
    successful.push({
      tokenAddress: token.tokenAddress,
      chainId: "solana",
      symbol: token.symbol,
      name: token.name,
      pairAddress: token.pairAddress,
      dexId: token.dexId,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      volume24h: token.volume24h,
      pairCreatedAt: token.pairCreatedAt,
      url: token.url ?? candidate.url,
      reasons,
    });
  }

  successful.sort((a, b) => {
    const ageA = a.pairCreatedAt ?? Number.NEGATIVE_INFINITY;
    const ageB = b.pairCreatedAt ?? Number.NEGATIVE_INFINITY;
    if (ageA !== ageB) return ageB - ageA;
    const liquidityA = a.liquidityUsd ?? Number.NEGATIVE_INFINITY;
    const liquidityB = b.liquidityUsd ?? Number.NEGATIVE_INFINITY;
    if (liquidityA !== liquidityB) return liquidityB - liquidityA;
    const volumeA = a.volume24h ?? Number.NEGATIVE_INFINITY;
    const volumeB = b.volume24h ?? Number.NEGATIVE_INFINITY;
    if (volumeA !== volumeB) return volumeB - volumeA;
    return a.tokenAddress.localeCompare(b.tokenAddress);
  });

  const requestedLimit = options.limit === undefined ? DEFAULT_SCREENING_LIMIT : Math.min(Math.max(Math.trunc(options.limit), 0), MAX_SCREENING_LIMIT);
  const limitations = [
    "Discovery candidates originate from DexScreener profiles and boosts; market fields are added by per-candidate pair enrichment.",
    ...sourceResult.data.limitations,
  ];
  if (enrichmentFailures > 0) limitations.push(`${enrichmentFailures} candidate(s) excluded because market-data enrichment failed.`);
  if (missingPairAge > 0) limitations.push(`${missingPairAge} candidate(s) had no pair creation time; recency was not evaluated for them.`);
  if (filteredOut > 0) limitations.push(`${filteredOut} enriched candidate(s) did not meet the configured available-data filters.`);
  if (sourceResult.data.candidates.length > MAX_CANDIDATES_TO_ENRICH) limitations.push(`Enrichment was capped at ${MAX_CANDIDATES_TO_ENRICH} candidates.`);
  return { ok: true, data: { candidates: successful.slice(0, requestedLimit), candidateSource: "dexscreener_profiles_and_boosts", limitations } };
}
