import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { ObservationRepository } from "../src/repositories/observationRepository.js";
import { investigateToken } from "../src/analyzers/tokenInvestigation.js";
import type { DexScreenerServiceResult, DexScreenerTokenData } from "../src/types/token-market-data.js";
import type { HeliusServiceResult } from "../src/types/helius.js";
import type { HeliusTokenAccountsResult } from "../src/types/helius-token-accounts.js";

const address = "Token111111111111111111111111111111111111111";
const market: DexScreenerTokenData = { chainId: "solana", tokenAddress: address, symbol: "A", name: "Alpha", priceUsd: 1, marketCap: 1000, fdv: 1000, liquidityUsd: 100, volume24h: 50, buys24h: 2, sells24h: 1, pairCreatedAt: 1, dexId: "dex", pairAddress: "pair", url: null };
const identity: HeliusServiceResult = { ok: true, data: { tokenAddress: address, name: "Alpha", symbol: "A", tokenStandard: "Fungible", decimals: 6, supply: 1000000, image: null, metadataUri: null, creators: [], authorities: [], assetInterface: "FungibleAsset", tokenProgram: null, mintAuthority: null, mintAuthorityKnown: true, freezeAuthority: null, freezeAuthorityKnown: true } };
const accounts: HeliusTokenAccountsResult = { ok: true, data: { tokenAddress: address, owner: null, totalSupplyUi: 1, decimals: 6, limit: 10, cursor: null, lastIndexedSlot: null, accounts: [], summary: { returnedAccountCount: 0, totalAccountsAvailable: 0, largestReturnedAccountPercentage: null, top5ReturnedAccountsPercentage: null, top10ReturnedAccountsPercentage: null }, limitations: [] } };
const failure = (reason: "not_found" | "network_error"): DexScreenerServiceResult => ({ ok: false, reason, detail: "provider failure", statusCode: null });

function repo() { return new ObservationRepository(new Database(":memory:")); }

test("investigates successfully and fetches providers once while keeping observation read-only", async () => {
  let marketCalls = 0; let identityCalls = 0;
  const repository = repo();
  const report = await investigateToken(address, { getTokenMarketData: async () => { marketCalls++; return { ok: true, data: market }; } }, { getTokenOnchainData: async () => { identityCalls++; return identity; } }, { getTokenAccounts: async () => accounts }, repository);
  assert.equal(report.status, "ok"); assert.ok(report.market); assert.ok(report.analysis); assert.ok(report.onchain); assert.ok(report.risk); assert.equal(marketCalls, 1); assert.equal(identityCalls, 1); assert.equal(report.observation.onWatchlist, false);
});

test("degrades independently and distinguishes both not-found failures", async () => {
  const identityOnly = await investigateToken(address, { getTokenMarketData: async () => failure("network_error") }, { getTokenOnchainData: async () => identity }, { getTokenAccounts: async () => accounts }, repo());
  assert.equal(identityOnly.status, "ok"); assert.equal(identityOnly.market, null); assert.equal(identityOnly.analysis, null);
  const marketOnly = await investigateToken(address, { getTokenMarketData: async () => ({ ok: true, data: market }) }, { getTokenOnchainData: async () => ({ ok: false, reason: "network_error", detail: "down", statusCode: null }) }, { getTokenAccounts: async () => accounts }, repo());
  assert.equal(marketOnly.status, "ok"); assert.equal(marketOnly.onchain, null); assert.ok(marketOnly.risk);
  const authorityOnly = await investigateToken(address, { getTokenMarketData: async () => ({ ok: true, data: market }) }, { getTokenOnchainData: async () => identity }, { getTokenAccounts: async () => ({ ok: false, reason: "network_error", detail: "down", statusCode: null }) }, repo());
  assert.ok(authorityOnly.risk); assert.ok(authorityOnly.risk.signals.some((signal) => signal.type === "mint_authority_revoked")); assert.ok(authorityOnly.limitations.some((limitation) => limitation.includes("Token-account data unavailable")));
  const missing = await investigateToken(address, { getTokenMarketData: async () => failure("not_found") }, { getTokenOnchainData: async () => ({ ok: false, reason: "not_found", detail: "missing", statusCode: null }) }, { getTokenAccounts: async () => accounts }, repo());
  assert.equal(missing.status, "not_found");
});
