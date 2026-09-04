import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { registerObservationTools } from "../src/mcp/observation.js";
import { ObservationRepository } from "../src/repositories/observationRepository.js";
import { ObservationService } from "../src/services/observation.js";
import type { DexScreenerServiceResult } from "../src/types/token-market-data.js";

const address = "Token111111111111111111111111111111111111111";
const market = (price: number | null, liquidity = 100, marketCap = 1_000, volume = 50): DexScreenerServiceResult => ({ ok: true, data: { chainId: "solana", tokenAddress: address, symbol: "A", name: "Alpha", priceUsd: price, liquidityUsd: liquidity, marketCap, fdv: marketCap, volume24h: volume, buys24h: 1, sells24h: 1, pairCreatedAt: 1, dexId: "dex", pairAddress: "pair", url: null } });
const baseMarketData = (): Extract<DexScreenerServiceResult, { ok: true }>["data"] => {
  const result = market(1);
  if (!result.ok) throw new Error("unreachable");
  return result.data;
};

function setup(result: DexScreenerServiceResult = market(1)) {
  const db = new Database(":memory:");
  const repository = new ObservationRepository(db);
  const service = new ObservationService(repository, { getTokenMarketData: async () => result });
  return { db, repository, service };
}

test("initializes SQLite schema and adds watchlist entries idempotently", () => {
  const { db, service } = setup();
  const first = service.addToWatchlist(address, "initial research");
  const second = service.addToWatchlist(address, "replacement");
  assert.equal((first as { data: { reason: string | null } }).data.reason, "initial research");
  assert.deepEqual(second, first);
  db.close();
});

test("captures snapshots, auto-adds tokens, and handles provider failure", async () => {
  const { db, service } = setup();
  const snapshot = await service.captureTokenSnapshot(address);
  assert.equal((snapshot as { data: { id: number } }).data.id, 1);
  assert.equal((service.getWatchlist() as { data: unknown[] }).data.length, 1);
  const failure = setup({ ok: false, reason: "network_error", detail: "down", statusCode: null });
  const failed = await failure.service.captureTokenSnapshot(address);
  assert.equal((failed as { reason: string }).reason, "network_error");
  assert.equal(failure.repository.getSnapshots(address).length, 0);
  db.close(); failure.db.close();
});

test("compares explicit and default earliest/latest snapshots with safe null arithmetic", async () => {
  const { db, service, repository } = setup();
  await service.captureTokenSnapshot(address);
  await service.captureTokenSnapshot(address);
  const all = repository.getSnapshots(address);
  const comparison = service.compareTokenSnapshots(address);
  assert.ok(!("reason" in comparison));
  assert.equal((comparison as { data: { changes: { pricePct: number | null } } }).data.changes.pricePct, 0);
  const explicit = service.compareTokenSnapshots(address, String(all[0]?.id), String(all[1]?.id));
  assert.ok(!("reason" in explicit));
  const emptyBase = market(null);
  assert.ok(emptyBase.ok);
  const empty = setup({ ok: true, data: { ...emptyBase.data, liquidityUsd: 0, marketCap: 0, volume24h: 0 } });
  await empty.service.captureTokenSnapshot(address);
  await empty.service.captureTokenSnapshot(address);
  const emptyComparison = empty.service.compareTokenSnapshots(address);
  assert.ok(!("reason" in emptyComparison));
  assert.deepEqual((emptyComparison as { data: { changes: Record<string, unknown> } }).data.changes, { pricePct: null, liquidityPct: null, marketCapPct: null, volumePct: null });
  db.close(); empty.db.close();
});

test("keeps different tokens isolated and supports watchlist limits", async () => {
  const db = new Database(":memory:");
  const repository = new ObservationRepository(db);
  const service = new ObservationService(repository, {
    getTokenMarketData: async (tokenAddress) => ({ ok: true, data: { ...baseMarketData(), tokenAddress } }),
  });
  service.addToWatchlist("a", null); service.addToWatchlist("b", null);
  assert.equal((service.getWatchlist(1) as { data: unknown[] }).data.length, 1);
  assert.equal((service.getWatchlist() as { data: unknown[] }).data.length, 2);
  await service.captureTokenSnapshot("a");
  await service.captureTokenSnapshot("b");
  assert.equal(repository.getSnapshots("a").length, 1);
  assert.equal(repository.getSnapshots("b").length, 1);
  const comparison = service.compareTokenSnapshots("other");
  assert.equal((comparison as { reason: string }).reason, "insufficient_data");
  db.close();
});

test("handles repository failures as a typed storage error", () => {
  const brokenRepository = { addWatchlist: () => { throw new Error("db unavailable"); } } as unknown as ObservationRepository;
  const service = new ObservationService(brokenRepository, { getTokenMarketData: async () => market(1) });
  const result = service.addToWatchlist(address, null);
  assert.equal((result as { reason: string }).reason, "storage_error");
});

test("maps insufficient snapshot data through the MCP tool", async () => {
  const { db, service } = setup();
  const server = new McpServer({ name: "observation-test-server", version: "0.1.0" });
  registerObservationTools(server, service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "observation-test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = (await client.callTool({ name: "compare_token_snapshots", arguments: { tokenAddress: address } }, CallToolResultSchema)) as CallToolResult;
    const content = result.content[0];
    assert.ok(content?.type === "text");
    assert.deepEqual(JSON.parse(content.text), { status: "insufficient_data", message: "At least two snapshots are required for comparison." });
  } finally {
    await client.close();
    await server.close();
    db.close();
  }
});

test("maps capture not_found through the MCP tool", async () => {
  const { db, service } = setup({ ok: false, reason: "not_found", detail: "No market data found.", statusCode: null });
  const server = new McpServer({ name: "observation-not-found-server", version: "0.1.0" });
  registerObservationTools(server, service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "observation-not-found-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = (await client.callTool({ name: "capture_token_snapshot", arguments: { tokenAddress: address } }, CallToolResultSchema)) as CallToolResult;
    const content = result.content[0];
    assert.ok(content?.type === "text");
    assert.deepEqual(JSON.parse(content.text), { status: "not_found", message: "No market data found." });
  } finally {
    await client.close();
    await server.close();
    db.close();
  }
});
