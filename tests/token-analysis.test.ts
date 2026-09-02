import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import {
  analyzeDexScreenerResult,
  generateAnalysisSignals,
  getDataQuality,
} from "../src/analyzers/tokenAnalysis.js";
import { safeDivide } from "../src/analyzers/safeDivide.js";
import { registerAnalyzeTokenTool } from "../src/mcp/analyze-token.js";
import { DexScreenerService } from "../src/services/dexscreener.js";
import type { DexScreenerTokenData } from "../src/types/token-market-data.js";

const tokenAddress = "Token111111111111111111111111111111111111111";

function createToken(
  overrides: Partial<DexScreenerTokenData> = {},
): DexScreenerTokenData {
  return {
    chainId: "solana",
    tokenAddress,
    symbol: "AH",
    name: "Alpha Hunter",
    priceUsd: 0.01,
    marketCap: 1_000,
    fdv: 1_100,
    liquidityUsd: 250,
    volume24h: 500,
    buys24h: 30,
    sells24h: 10,
    pairCreatedAt: 1_700_000_000_000,
    dexId: "raydium",
    pairAddress: "pair-address",
    url: "https://dexscreener.com/solana/pair-address",
    ...overrides,
  };
}

function successfulResult(token: DexScreenerTokenData) {
  return { ok: true as const, data: token };
}

function assertOnlyFiniteNumbers(value: unknown): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value));
  } else if (Array.isArray(value)) {
    value.forEach(assertOnlyFiniteNumbers);
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach(assertOnlyFiniteNumbers);
  }
}

test("calculates all deterministic ratios using available market data", () => {
  const analysis = analyzeDexScreenerResult(successfulResult(createToken()));

  assert.ok(analysis.ok);
  assert.deepEqual(analysis.data.metrics, {
    liquidityToMarketCap: 0.25,
    volumeToLiquidity: 2,
    buySellRatio: 3,
  });
});

test("returns null for buy/sell ratio when sells are zero and buys are positive", () => {
  const analysis = analyzeDexScreenerResult(
    successfulResult(createToken({ buys24h: 10, sells24h: 0 })),
  );

  assert.ok(analysis.ok);
  assert.equal(analysis.data.metrics.buySellRatio, null);
});

test("returns null for buy/sell ratio when both buys and sells are zero", () => {
  const analysis = analyzeDexScreenerResult(
    successfulResult(createToken({ buys24h: 0, sells24h: 0 })),
  );

  assert.ok(analysis.ok);
  assert.equal(analysis.data.metrics.buySellRatio, null);
});

test("safeDivide and analysis metrics return null for missing or invalid divisions", () => {
  assert.equal(safeDivide(null, 1), null);
  assert.equal(safeDivide(1, null), null);
  assert.equal(safeDivide(1, 0), null);
  assert.equal(safeDivide(Number.NaN, 1), null);

  const analysis = analyzeDexScreenerResult(
    successfulResult(
      createToken({
        marketCap: null,
        liquidityUsd: null,
        volume24h: null,
        buys24h: null,
        sells24h: null,
      }),
    ),
  );

  assert.ok(analysis.ok);
  assert.deepEqual(analysis.data.metrics, {
    liquidityToMarketCap: null,
    volumeToLiquidity: null,
    buySellRatio: null,
  });
});

test("calculates completeness from only the defined market-data field set", () => {
  const quality = getDataQuality(
    createToken({
      priceUsd: null,
      liquidityUsd: null,
      buys24h: null,
    }),
  );

  assert.deepEqual(quality, {
    completenessScore: 62.5,
    missingFields: ["priceUsd", "liquidityUsd", "buys24h"],
  });
});

test("generates factual availability and ratio signals", () => {
  const token = createToken({
    liquidityUsd: null,
    marketCap: null,
    volume24h: null,
    buys24h: null,
    sells24h: null,
  });
  const signals = generateAnalysisSignals(token, {
    liquidityToMarketCap: null,
    volumeToLiquidity: null,
    buySellRatio: null,
  });

  assert.deepEqual(
    signals.map((signal) => signal.type),
    [
      "liquidity_unavailable",
      "market_cap_unavailable",
      "volume_unavailable",
      "buy_sell_activity_unavailable",
      "ratios_unavailable",
    ],
  );
});

test("signals high activity relative to liquidity above the configured threshold", () => {
  const signals = generateAnalysisSignals(createToken(), {
    liquidityToMarketCap: 0.25,
    volumeToLiquidity: 5.1,
    buySellRatio: 3,
  });

  assert.ok(signals.some((signal) => signal.type === "high_volume_to_liquidity"));
});

test("does not produce NaN or Infinity in a full edge-case analysis", () => {
  const analysis = analyzeDexScreenerResult(
    successfulResult(
      createToken({
        marketCap: 0,
        liquidityUsd: 0,
        volume24h: 0,
        buys24h: 0,
        sells24h: 0,
      }),
    ),
  );

  assert.ok(analysis.ok);
  assertOnlyFiniteNumbers(analysis.data);
  assert.deepEqual(analysis.data.metrics, {
    liquidityToMarketCap: null,
    volumeToLiquidity: null,
    buySellRatio: null,
  });
});

test("maps a DexScreener 404 through the analyze_token MCP tool as not_found", async () => {
  const service = new DexScreenerService(
    async () => new Response(null, { status: 404 }),
  );
  const server = new McpServer({ name: "analysis-test-server", version: "0.1.0" });
  registerAnalyzeTokenTool(server, service);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "analysis-test-client", version: "0.1.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const result = (await client.callTool(
      {
        name: "analyze_token",
        arguments: { tokenAddress },
      },
      CallToolResultSchema,
    )) as CallToolResult;
    const content = result.content[0];

    assert.ok(content?.type === "text");
    assert.deepEqual(JSON.parse(content.text), {
      status: "not_found",
      message: "No Solana market data was found for this token.",
    });
  } finally {
    await client.close();
    await server.close();
  }
});
