import assert from "node:assert/strict";
import test from "node:test";
import { screenDiscoveryCandidates } from "../src/analyzers/discoveryScreening.js";
import { MAX_CANDIDATES_TO_ENRICH } from "../src/config/discoveryThresholds.js";
import type { CandidateSource } from "../src/types/discovery-screening.js";
import type { DexScreenerServiceResult } from "../src/types/token-market-data.js";

const source: CandidateSource = { getCandidates: async () => ({ ok: true, data: { candidates: [
  { tokenAddress: "a", chainId: "solana", url: null, description: null, sourceTypes: ["profile"], boostAmount: null, boostTotalAmount: null },
  { tokenAddress: "b", chainId: "solana", url: null, description: null, sourceTypes: ["profile"], boostAmount: null, boostTotalAmount: null },
], sourcesQueried: { profile: "ok", boostedLatest: "skipped", boostedTop: "skipped" }, limitations: [] } }) };
const market = (address: string, values: Partial<NonNullable<Extract<DexScreenerServiceResult, { ok: true }>['data']>> = {}): DexScreenerServiceResult => ({ ok: true, data: {
  tokenAddress: address, chainId: "solana", symbol: "S", name: "Token", pairAddress: "pair", dexId: "dex", priceUsd: 1, liquidityUsd: 10_000, volume24h: 20_000, pairCreatedAt: Date.now() - 1_000, marketCap: null, fdv: null, buys24h: null, sells24h: null, ...values,
} as NonNullable<Extract<DexScreenerServiceResult, { ok: true }>['data']> });

test("enriches, filters, ranks, and applies output limit after ranking", async () => {
  const result = await screenDiscoveryCandidates(source, { getTokenMarketData: async (address) => market(address, { liquidityUsd: address === "a" ? 20_000 : 5_000, pairCreatedAt: address === "a" ? Date.now() - 1_000 : Date.now() - 2_000 }) }, { limit: 1 });
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 1);
  assert.equal(result.data.candidates[0]?.tokenAddress, "a");
  assert.ok(result.data.candidates[0]?.reasons.includes("liquidity_requirement_met"));
});

test("excludes failed enrichment and counts it", async () => {
  const result = await screenDiscoveryCandidates(source, { getTokenMarketData: async (address) => address === "a" ? { ok: false, reason: "network_error", detail: "x", statusCode: null } : market(address) });
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 1);
  assert.ok(result.data.limitations.some((item) => item.includes("enrichment failed")));
});

test("applies liquidity, volume, and age filters while leaving missing criteria unevaluated", async () => {
  const candidates: CandidateSource = { getCandidates: async () => ({ ok: true, data: { ...sourceCandidates(), sourcesQueried: { profile: "ok", boostedLatest: "skipped", boostedTop: "skipped" }, limitations: [] } }) };
  const result = await screenDiscoveryCandidates(candidates, { getTokenMarketData: async (address) => market(address, address === "a" ? { liquidityUsd: 999 } : address === "b" ? { volume24h: 999 } : { pairCreatedAt: null, liquidityUsd: null, volume24h: null }) }, {}, Date.now());
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 1);
  assert.equal(result.data.candidates[0]?.tokenAddress, "c");
});

test("respects the enrichment cap", async () => {
  let calls = 0;
  const many: CandidateSource = { getCandidates: async () => ({ ok: true, data: { candidates: Array.from({ length: MAX_CANDIDATES_TO_ENRICH + 5 }, (_, i) => ({ tokenAddress: `t${i}`, chainId: "solana" as const, url: null, description: null, sourceTypes: ["profile" as const], boostAmount: null, boostTotalAmount: null })), sourcesQueried: { profile: "ok", boostedLatest: "skipped", boostedTop: "skipped" }, limitations: [] } }) };
  const result = await screenDiscoveryCandidates(many, { getTokenMarketData: async (address) => { calls += 1; return market(address); } });
  assert.ok(result.ok);
  assert.equal(calls, MAX_CANDIDATES_TO_ENRICH);
});

test("returns an error when the candidate source fails", async () => {
  const result = await screenDiscoveryCandidates({ getCandidates: async () => ({ ok: false, reason: "error", detail: "down", statusCode: null }) }, { getTokenMarketData: async () => market("x") });
  assert.deepEqual(result, { ok: false, reason: "error", detail: "The discovery candidate source failed.", statusCode: null });
});

function sourceCandidates() {
  return { candidates: ["a", "b", "c"].map((tokenAddress) => ({ tokenAddress, chainId: "solana" as const, url: null, description: null, sourceTypes: ["profile" as const], boostAmount: null, boostTotalAmount: null })) };
}
