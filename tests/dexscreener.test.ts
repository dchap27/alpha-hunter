import assert from "node:assert/strict";
import test from "node:test";

import {
  DexScreenerService,
  normalizeDexScreenerTokenData,
  parseDexScreenerPairs,
  selectRepresentativeSolanaPair,
} from "../src/services/dexscreener.js";

const tokenAddress = "Token111111111111111111111111111111111111111";

test("selects the highest-liquidity Solana pair and ignores other chains", () => {
  const pairs = parseDexScreenerPairs([
    {
      chainId: "ethereum",
      liquidity: { usd: 900_000 },
    },
    {
      chainId: "solana",
      pairAddress: "solana-lower-liquidity",
      liquidity: { usd: 150_000 },
    },
    {
      chainId: "solana",
      pairAddress: "solana-higher-liquidity",
      liquidity: { usd: 450_000 },
    },
  ]);

  assert.ok(pairs);
  assert.equal(
    selectRepresentativeSolanaPair(pairs)?.pairAddress,
    "solana-higher-liquidity",
  );
});

test("returns null when no valid Solana pair is available", () => {
  const pairs = parseDexScreenerPairs([
    { chainId: "ethereum", liquidity: { usd: 900_000 } },
    { chainId: "base", liquidity: { usd: 100_000 } },
  ]);

  assert.ok(pairs);
  assert.equal(selectRepresentativeSolanaPair(pairs), null);
});

test("normalizes available DexScreener fields without inventing missing values", () => {
  const pairs = parseDexScreenerPairs([
    {
      chainId: "solana",
      dexId: "raydium",
      url: "https://dexscreener.com/solana/pair-address",
      pairAddress: "pair-address",
      baseToken: {
        address: tokenAddress,
        symbol: "AH",
        name: "Alpha Hunter",
      },
      priceUsd: "0.00125",
      marketCap: 1_250_000,
      fdv: 1_500_000,
      liquidity: { usd: 250_000 },
      volume: { h24: 75_500 },
      txns: { h24: { buys: 410, sells: 235 } },
      pairCreatedAt: 1_700_000_000_000,
    },
  ]);

  assert.ok(pairs);
  const pair = selectRepresentativeSolanaPair(pairs);
  assert.ok(pair);

  assert.deepEqual(normalizeDexScreenerTokenData(pair, tokenAddress), {
    chainId: "solana",
    tokenAddress,
    symbol: "AH",
    name: "Alpha Hunter",
    priceUsd: 0.00125,
    marketCap: 1_250_000,
    fdv: 1_500_000,
    liquidityUsd: 250_000,
    volume24h: 75_500,
    buys24h: 410,
    sells24h: 235,
    pairCreatedAt: 1_700_000_000_000,
    dexId: "raydium",
    pairAddress: "pair-address",
    url: "https://dexscreener.com/solana/pair-address",
  });
});

test("normalizes missing optional provider fields as null", () => {
  const pairs = parseDexScreenerPairs([
    {
      chainId: "solana",
      baseToken: { address: tokenAddress },
    },
  ]);

  assert.ok(pairs);
  const pair = selectRepresentativeSolanaPair(pairs);
  assert.ok(pair);

  assert.deepEqual(normalizeDexScreenerTokenData(pair, tokenAddress), {
    chainId: "solana",
    tokenAddress,
    symbol: null,
    name: null,
    priceUsd: null,
    marketCap: null,
    fdv: null,
    liquidityUsd: null,
    volume24h: null,
    buys24h: null,
    sells24h: null,
    pairCreatedAt: null,
    dexId: null,
    pairAddress: null,
    url: null,
  });
});

test("uses case-sensitive Solana addresses when identifying the requested token", () => {
  const pairs = parseDexScreenerPairs([
    {
      chainId: "solana",
      baseToken: {
        address: tokenAddress.toLowerCase(),
        symbol: "WRONG",
        name: "Wrong Case",
      },
    },
  ]);

  assert.ok(pairs);
  const pair = selectRepresentativeSolanaPair(pairs);
  assert.ok(pair);

  const data = normalizeDexScreenerTokenData(pair, tokenAddress);
  assert.equal(data.symbol, null);
  assert.equal(data.name, null);
});

test("returns not_found when an injected fetcher returns no Solana pairs", async () => {
  const service = new DexScreenerService(
    async () =>
      new Response(JSON.stringify([{ chainId: "ethereum" }]), { status: 200 }),
  );

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "not_found",
    detail: "DexScreener has no Solana market pairs for this token.",
    statusCode: null,
  });
});

test("returns a typed network error when an injected fetcher fails", async () => {
  const service = new DexScreenerService(async () => {
    throw new Error("offline");
  });

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "network_error",
    detail: "Unable to reach the DexScreener API.",
    statusCode: null,
  });
});

test("returns not_found for a DexScreener HTTP 404 response", async () => {
  const service = new DexScreenerService(
    async () => new Response(null, { status: 404 }),
  );

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "not_found",
    detail: "DexScreener has no market pairs for this token.",
    statusCode: 404,
  });
});

test("returns a typed HTTP error for non-404 DexScreener failures", async () => {
  const service = new DexScreenerService(
    async () => new Response(null, { status: 500 }),
  );

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "http_error",
    detail: "DexScreener API request failed with HTTP 500.",
    statusCode: 500,
  });
});

test("aborts a hung request after the configured timeout", async () => {
  const service = new DexScreenerService(
    async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    1,
  );

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "network_error",
    detail: "The DexScreener request timed out.",
    statusCode: null,
  });
});

test("returns a typed malformed-response error for invalid JSON", async () => {
  const service = new DexScreenerService(
    async () => new Response("not json", { status: 200 }),
  );

  assert.deepEqual(await service.getTokenMarketData(tokenAddress), {
    ok: false,
    reason: "malformed_response",
    detail: "DexScreener returned an unreadable JSON response.",
    statusCode: null,
  });
});
