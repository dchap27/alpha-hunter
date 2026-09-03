import assert from "node:assert/strict";
import test from "node:test";
import { DexScreenerDiscoveryService } from "../src/services/dexscreener-discovery.js";

const a = "TokenA";
const b = "TokenB";
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("filters Solana, deduplicates, merges sources, and prefers top boost values", async () => {
  const service = new DexScreenerDiscoveryService(async (url) => {
    const path = String(url);
    if (path.includes("token-profiles")) return response([{ chainId: "solana", tokenAddress: a, url: "profile", description: "A" }, { chainId: "ethereum", tokenAddress: "eth" }]);
    if (path.includes("token-boosts/latest")) return response([{ chainId: "solana", tokenAddress: a, amount: 1, totalAmount: 2 }, { chainId: "solana", tokenAddress: b, amount: 3, totalAmount: 4 }]);
    return response([{ chainId: "solana", tokenAddress: a, amount: 10, totalAmount: 20 }]);
  });
  const result = await service.discoverTokens();
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 2);
  assert.deepEqual(result.data.candidates[0], { tokenAddress: a, chainId: "solana", url: "profile", description: "A", sourceTypes: ["profile", "boosted_latest", "boosted_top"], boostAmount: 10, boostTotalAmount: 20 });
});

test("degrades gracefully on partial failure and applies limit after merge", async () => {
  const service = new DexScreenerDiscoveryService(async (url) => String(url).includes("token-profiles") ? response([{ chainId: "solana", tokenAddress: a }, { chainId: "solana", tokenAddress: b }]) : Promise.reject(new Error("offline")));
  const result = await service.discoverTokens({ limit: 1 });
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 1);
  assert.equal(result.data.sourcesQueried.profile, "ok");
  assert.equal(result.data.sourcesQueried.boostedLatest, "error");
  assert.ok(result.data.limitations.some((item) => item.includes("latest-boost")));
});

test("returns error when every requested source fails", async () => {
  const service = new DexScreenerDiscoveryService(async () => response(null, 500));
  const result = await service.discoverTokens();
  assert.deepEqual(result, { ok: false, reason: "error", detail: "All requested DexScreener discovery sources failed.", statusCode: null });
});

test("skips unrequested sources and preserves successful empty results", async () => {
  const called: string[] = [];
  const service = new DexScreenerDiscoveryService(async (url) => { called.push(String(url)); return response([]); });
  const result = await service.discoverTokens({ sources: ["profile"] });
  assert.ok(result.ok);
  assert.equal(result.data.candidates.length, 0);
  assert.equal(called.length, 1);
  assert.equal(result.data.sourcesQueried.boostedLatest, "skipped");
  assert.equal(result.data.sourcesQueried.boostedTop, "skipped");
});

test("respects an explicitly empty source list without making requests", async () => {
  let calls = 0;
  const service = new DexScreenerDiscoveryService(async () => {
    calls += 1;
    return response([]);
  });
  const result = await service.discoverTokens({ sources: [] });
  assert.ok(result.ok);
  assert.equal(calls, 0);
  assert.deepEqual(result.data.candidates, []);
  assert.deepEqual(result.data.sourcesQueried, {
    profile: "skipped",
    boostedLatest: "skipped",
    boostedTop: "skipped",
  });
});

test("handles malformed responses as a partial source failure", async () => {
  const service = new DexScreenerDiscoveryService(async (url) =>
    String(url).includes("token-profiles")
      ? new Response("not json", { status: 200 })
      : response([{ chainId: "solana", tokenAddress: a }]),
  );
  const result = await service.discoverTokens();
  assert.ok(result.ok);
  assert.equal(result.data.sourcesQueried.profile, "error");
  assert.ok(result.data.limitations.some((item) => item.includes("profile source failed")));
});

test("handles an aborted source as a partial failure without hanging", async () => {
  const service = new DexScreenerDiscoveryService(async (url, init) => {
    if (String(url).includes("token-profiles")) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }
    return response([{ chainId: "solana", tokenAddress: a }]);
  }, 1);
  const result = await service.discoverTokens();
  assert.ok(result.ok);
  assert.equal(result.data.sourcesQueried.profile, "error");
  assert.ok(result.data.limitations.some((item) => item.includes("profile source failed")));
});
