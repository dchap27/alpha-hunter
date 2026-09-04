import { analyzeDexScreenerResult } from "./tokenAnalysis.js";
import { computeRiskSignals } from "./tokenRisk.js";
import type { DexScreenerServiceResult } from "../types/token-market-data.js";
import type { HeliusServiceResult } from "../types/helius.js";
import type { HeliusTokenAccountsResult } from "../types/helius-token-accounts.js";
import type { TokenInvestigationReport } from "../types/token-investigation.js";
import type { ObservationRepository } from "../repositories/observationRepository.js";

type MarketService = { getTokenMarketData(address: string): Promise<DexScreenerServiceResult> };
type IdentityService = { getTokenOnchainData(address: string): Promise<HeliusServiceResult> };
type AccountsService = { getTokenAccounts(params: { tokenAddress: string }): Promise<HeliusTokenAccountsResult> };

export async function investigateToken(
  tokenAddress: string,
  marketService: MarketService,
  identityService: IdentityService,
  accountsService: AccountsService,
  repository: Pick<ObservationRepository, "getWatchlistEntry" | "getSnapshots">,
): Promise<TokenInvestigationReport> {
  const [marketResult, identityResult, accountsResult] = await Promise.all([
    marketService.getTokenMarketData(tokenAddress),
    identityService.getTokenOnchainData(tokenAddress),
    accountsService.getTokenAccounts({ tokenAddress }),
  ]);
  const limitations: string[] = [];
  const market = marketResult.ok ? marketResult.data : null;
  const analysisResult = analyzeDexScreenerResult(marketResult);
  const analysis = analysisResult.ok ? analysisResult.data : null;
  const onchain = identityResult.ok ? identityResult.data : null;
  // computeRiskSignals degrades gracefully on its own — called unconditionally
  // with whatever identity/accounts results are available; partial failures
  // still produce partial signals, with the failing side noted in limitations.
  const riskResult = computeRiskSignals(tokenAddress, identityResult, accountsResult);
  const risk = riskResult?.ok ? riskResult.data : null;
  if (!marketResult.ok) limitations.push(`Market data unavailable: ${marketResult.reason}.`);
  if (!identityResult.ok) limitations.push(`Onchain identity unavailable: ${identityResult.reason}.`);
  if (!accountsResult.ok) limitations.push(`Token-account data unavailable: ${accountsResult.reason}.`);
  let observationReadFailed = false;
  let observation = { onWatchlist: false, addedAt: null as number | null, snapshotCount: 0, earliestSnapshotAt: null as number | null, latestSnapshotAt: null as number | null };
  try {
    const entry = repository.getWatchlistEntry(tokenAddress);
    const snapshots = repository.getSnapshots(tokenAddress);
    observation = { onWatchlist: entry !== null, addedAt: entry?.addedAt ?? null, snapshotCount: snapshots.length, earliestSnapshotAt: snapshots[0]?.capturedAt ?? null, latestSnapshotAt: snapshots.at(-1)?.capturedAt ?? null };
  } catch { observationReadFailed = true; limitations.push("Observation history could not be read."); }
  const bothNotFound = !marketResult.ok && !identityResult.ok && marketResult.reason === "not_found" && identityResult.reason === "not_found";
  const status = bothNotFound
    ? "not_found"
    : market === null && analysis === null && onchain === null && risk === null
      ? "error"
      : !marketResult.ok || !identityResult.ok || !accountsResult.ok || observationReadFailed
        ? "partial"
        : "ok";
  return { tokenAddress, status, market, analysis, onchain, risk, observation, limitations };
}
