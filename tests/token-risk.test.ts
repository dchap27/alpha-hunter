import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assessTokenRisk } from "../src/analyzers/tokenRisk.js";
import { registerAssessTokenRiskTool } from "../src/mcp/assess-token-risk.js";
import type { HeliusServiceResult } from "../src/types/helius.js";
import type { HeliusTokenAccountsResult } from "../src/types/helius-token-accounts.js";

const address = "Mint111111111111111111111111111111111111111";
const authorityData = (mint: string | null, mintKnown = true, freeze: string | null = null, freezeKnown = true): HeliusServiceResult => ({ ok: true, data: {
  tokenAddress: address, name: null, symbol: null, tokenStandard: null, decimals: 6, supply: 1_000_000, image: null, metadataUri: null, creators: [], authorities: [], assetInterface: null, tokenProgram: null,
  mintAuthority: mint, mintAuthorityKnown: mintKnown, freezeAuthority: freeze, freezeAuthorityKnown: freezeKnown,
} });
const tokenAccountsData = (top10: number | null): HeliusTokenAccountsResult => ({ ok: true, data: {
  tokenAddress: address, owner: null, totalSupplyUi: 1_000_000, decimals: 6, limit: 100, cursor: null, lastIndexedSlot: null, accounts: [],
  summary: { returnedAccountCount: 10, totalAccountsAvailable: 10, largestReturnedAccountPercentage: 10, top5ReturnedAccountsPercentage: 30, top10ReturnedAccountsPercentage: top10 },
  limitations: [],
} });
const services = (authority: HeliusServiceResult, tokenAccounts: HeliusTokenAccountsResult) => [
  { getTokenOnchainData: async () => authority },
  { getTokenAccounts: async () => tokenAccounts },
] as const;

test("reports revoked and present authority facts", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData(null), tokenAccountsData(40)));
  assert.ok(result.ok);
  assert.equal(result.data.authority.mintAuthorityRevoked, true);
  assert.ok(result.data.signals.some((signal) => signal.type === "mint_authority_revoked"));
  const present = await assessTokenRisk(address, ...services(authorityData("authority"), tokenAccountsData(40)));
  assert.ok(present.ok);
  assert.equal(present.data.authority.mintAuthorityRevoked, false);
  assert.ok(present.data.signals.some((signal) => signal.type === "mint_authority_present"));
});

test("reports unknown mint and freeze authorities with limitations", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData(null, false, null, false), tokenAccountsData(40)));
  assert.ok(result.ok);
  assert.equal(result.data.authority.mintAuthorityRevoked, null);
  assert.equal(result.data.authority.freezeAuthorityRevoked, null);
  assert.ok(result.data.limitations.some((item) => item.includes("Mint authority status")));
  assert.ok(result.data.limitations.some((item) => item.includes("Freeze authority status")));
});

test("reports freeze authority present as a factual warning", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData(null, true, "freeze-authority"), tokenAccountsData(40)));
  assert.ok(result.ok);
  assert.equal(result.data.authority.freezeAuthorityRevoked, false);
  assert.ok(result.data.signals.some((signal) => signal.type === "freeze_authority_present"));
});

test("signals top-10 concentration only above the configured threshold", async () => {
  const high = await assessTokenRisk(address, ...services(authorityData(null), tokenAccountsData(60)));
  assert.ok(high.ok);
  assert.ok(high.data.signals.some((signal) => signal.type === "top10_concentration_high" && signal.message.includes("60%")));
  const low = await assessTokenRisk(address, ...services(authorityData(null), tokenAccountsData(40)));
  assert.ok(low.ok);
  assert.equal(low.data.signals.some((signal) => signal.type === "top10_concentration_high"), false);
});

test("describes concentration using returned token accounts and total-supply percentage", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData(null), tokenAccountsData(60)));
  assert.ok(result.ok);
  const signal = result.data.signals.find((item) => item.type === "top10_concentration_high");
  assert.ok(signal);
  assert.match(signal.message, /returned token accounts/);
  assert.match(signal.message, /60% of total supply/);
  assert.equal(signal.message.toLowerCase().includes("holder"), false);
});

test("reports unavailable concentration with a limitation", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData(null), tokenAccountsData(null)));
  assert.ok(result.ok);
  assert.ok(result.data.signals.some((signal) => signal.type === "concentration_unknown"));
  assert.ok(result.data.limitations.some((item) => item.includes("Token-account concentration could not be assessed")));
});

test("handles matching and differing failures, and partial success", async () => {
  const failure = { ok: false as const, reason: "configuration_error" as const, detail: "missing", statusCode: null };
  const same = await assessTokenRisk(address, ...services(failure, failure));
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.reason, "configuration_error");
  const different = await assessTokenRisk(address, ...services(failure, { ...failure, reason: "network_error" }));
  assert.equal(different.ok, false);
  if (!different.ok) assert.equal(different.reason, "error");
  const partial = await assessTokenRisk(address, ...services(authorityData(null), failure));
  assert.ok(partial.ok);
  assert.ok(partial.data.limitations.some((item) => item.includes("Token-account concentration checks unavailable")));
});

test("generated signals contain no prohibited recommendation language", async () => {
  const result = await assessTokenRisk(address, ...services(authorityData("authority", true, "freeze"), tokenAccountsData(80)));
  assert.ok(result.ok);
  const banned = ["safe", "unsafe", "scam", "rug", "buy", "sell", "risky", "dangerous"];
  for (const signal of result.data.signals) {
    for (const word of banned) assert.equal(signal.message.toLowerCase().includes(word), false);
  }
});

test("maps matching configuration failures to a configuration_error MCP response", async () => {
  const failure = { ok: false as const, reason: "configuration_error" as const, detail: "missing", statusCode: null };
  const server = new McpServer({ name: "risk-test-server", version: "0.1.0" });
  registerAssessTokenRiskTool(server, { getTokenOnchainData: async () => failure }, { getTokenAccounts: async () => failure });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "risk-test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = (await client.callTool({ name: "assess_token_risk", arguments: { tokenAddress: address } }, CallToolResultSchema)) as CallToolResult;
    const content = result.content[0];
    assert.ok(content?.type === "text");
    assert.deepEqual(JSON.parse(content.text), {
      status: "configuration_error",
      message: "Helius is not configured. Set HELIUS_API_KEY to use this tool.",
    });
  } finally {
    await client.close();
    await server.close();
  }
});
