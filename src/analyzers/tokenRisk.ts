import { TOP10_CONCENTRATION_WARNING_PCT } from "../config/riskThresholds.js";
import type { HeliusServiceResult } from "../types/helius.js";
import type { HeliusTokenAccountsResult } from "../types/helius-token-accounts.js";
import type { RiskSignal, TokenRiskAssessment, TokenRiskResult } from "../types/token-risk.js";

function authorityStatus(known: boolean, value: string | null): boolean | null {
  return known ? value === null : null;
}

function failureReason(result: HeliusServiceResult | HeliusTokenAccountsResult): string {
  return result.ok ? "" : result.reason;
}

export async function assessTokenRisk(
  tokenAddress: string,
  authorityService: { getTokenOnchainData(address: string): Promise<HeliusServiceResult> },
  tokenAccountsService: { getTokenAccounts(params: { tokenAddress: string }): Promise<HeliusTokenAccountsResult> },
): Promise<TokenRiskResult> {
  // HeliusTokenAccountsService already performs its own getAsset lookup; this direct
  // authority lookup is intentionally duplicated for the v0.1 layer contract.
  const [authorityResult, tokenAccountsResult] = await Promise.all([
    authorityService.getTokenOnchainData(tokenAddress),
    tokenAccountsService.getTokenAccounts({ tokenAddress }),
  ]);

  return computeRiskSignals(tokenAddress, authorityResult, tokenAccountsResult);
}

export function computeRiskSignals(
  tokenAddress: string,
  authorityResult: HeliusServiceResult,
  tokenAccountsResult: HeliusTokenAccountsResult,
): TokenRiskResult {

  if (!authorityResult.ok && !tokenAccountsResult.ok) {
    if (failureReason(authorityResult) === failureReason(tokenAccountsResult)) return authorityResult;
    return { ok: false, reason: "error", detail: "Risk observations could not be completed.", statusCode: null };
  }

  const signals: RiskSignal[] = [];
  const limitations: string[] = [];
  const authority = {
    mintAuthorityRevoked: authorityResult.ok ? authorityStatus(authorityResult.data.mintAuthorityKnown, authorityResult.data.mintAuthority) : null,
    freezeAuthorityRevoked: authorityResult.ok ? authorityStatus(authorityResult.data.freezeAuthorityKnown, authorityResult.data.freezeAuthority) : null,
  };

  if (authorityResult.ok) {
    if (authorityResult.data.mintAuthorityKnown) {
      signals.push(authorityResult.data.mintAuthority === null
        ? { type: "mint_authority_revoked", severity: "info", message: "Mint authority has been revoked." }
        : { type: "mint_authority_present", severity: "warning", message: "Mint authority has not been revoked; token supply could be changed by the authority holder." });
    } else {
      signals.push({ type: "mint_authority_unknown", severity: "info", message: "Mint authority status could not be determined." });
      limitations.push("Mint authority status could not be determined.");
    }
    if (authorityResult.data.freezeAuthorityKnown) {
      signals.push(authorityResult.data.freezeAuthority === null
        ? { type: "freeze_authority_revoked", severity: "info", message: "Freeze authority has been revoked." }
        : { type: "freeze_authority_present", severity: "warning", message: "Freeze authority has not been revoked; tokens could be frozen by the authority holder." });
    } else {
      signals.push({ type: "freeze_authority_unknown", severity: "info", message: "Freeze authority status could not be determined." });
      limitations.push("Freeze authority status could not be determined.");
    }
  } else {
    limitations.push("Mint and freeze authority checks could not be completed.");
  }

  const concentration = {
    top10Percentage: tokenAccountsResult.ok ? tokenAccountsResult.data.summary.top10ReturnedAccountsPercentage : null,
    largestTokenAccountPercentage: tokenAccountsResult.ok ? tokenAccountsResult.data.summary.largestReturnedAccountPercentage : null,
  };
  if (tokenAccountsResult.ok) {
    limitations.push(...tokenAccountsResult.data.limitations);
    if (concentration.top10Percentage === null) {
      signals.push({ type: "concentration_unknown", severity: "info", message: "Token-account concentration could not be assessed from the available supply data." });
      limitations.push("Token-account concentration could not be assessed because supply or decimals were unavailable.");
    } else if (concentration.top10Percentage > TOP10_CONCENTRATION_WARNING_PCT) {
      signals.push({ type: "top10_concentration_high", severity: "warning", message: `The top 10 returned token accounts represent ${concentration.top10Percentage}% of total supply.` });
    }
  } else {
    limitations.push("Token-account concentration checks could not be completed.");
  }
  if (!authorityResult.ok) limitations.push(`Authority checks unavailable: ${authorityResult.reason}.`);
  if (!tokenAccountsResult.ok) limitations.push(`Token-account concentration checks unavailable: ${tokenAccountsResult.reason}.`);

  return { ok: true, data: { assessmentVersion: "0.1", tokenAddress, authority, concentration, signals, limitations } };
}
