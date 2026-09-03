import assert from "node:assert/strict";
import test from "node:test";

import { HeliusService } from "../src/services/helius.js";

const tokenAddress = "Token111111111111111111111111111111111111111";
const apiKey = "test-api-key";

test("normalizes a successful Helius getAsset response", async () => {
  let request: RequestInit | undefined;
  const service = new HeliusService(async (_url, init) => {
    request = init;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        result: {
          id: tokenAddress,
          interface: "FungibleToken",
          content: {
            json_uri: "https://example.com/metadata.json",
            metadata: { name: "Alpha Hunter", symbol: "AH", token_standard: "Fungible" },
            links: { image: "https://example.com/image.png" },
          },
          token_info: {
            decimals: 6,
            supply: 1_000_000,
            token_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
            mint_authority: "mint-authority",
            freeze_authority: "freeze-authority",
          },
          creators: [{ address: "creator", share: 100, verified: true }],
          authorities: [{ address: "authority", scopes: ["full"] }],
        },
      }),
      { status: 200 },
    );
  }, apiKey);

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: true,
    data: {
      tokenAddress,
      name: "Alpha Hunter",
      symbol: "AH",
      tokenStandard: "Fungible",
      decimals: 6,
      supply: 1_000_000,
      image: "https://example.com/image.png",
      metadataUri: "https://example.com/metadata.json",
      creators: [{ address: "creator", share: 100, verified: true }],
      authorities: [{ address: "authority", scopes: ["full"] }],
      assetInterface: "FungibleToken",
      tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      mintAuthority: "mint-authority",
      mintAuthorityKnown: true,
      freezeAuthority: "freeze-authority",
      freezeAuthorityKnown: true,
    },
  });
  assert.equal(request?.method, "POST");
  assert.equal(request?.signal?.aborted, false);
});

test("returns not_found when Helius has no asset result", async () => {
  const service = new HeliusService(
    async () => new Response(JSON.stringify({ jsonrpc: "2.0", result: null }), { status: 200 }),
    apiKey,
  );

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "not_found",
    detail: "Helius has no asset data for this token.",
    statusCode: null,
  });
});

test("returns a configuration error without making a request when HELIUS_API_KEY is absent", async () => {
  let calls = 0;
  const service = new HeliusService(async () => {
    calls += 1;
    return new Response();
  }, undefined);

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "configuration_error",
    detail: "HELIUS_API_KEY is not configured.",
    statusCode: null,
  });
  assert.equal(calls, 0);
});

test("returns a typed HTTP error", async () => {
  const service = new HeliusService(
    async () => new Response(null, { status: 500 }),
    apiKey,
  );

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "http_error",
    detail: "Helius API request failed with HTTP 500.",
    statusCode: 500,
  });
});

test("returns a typed API error for a JSON-RPC error response", async () => {
  const service = new HeliusService(
    async () =>
      new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32602, message: "Invalid params" } }),
        { status: 200 },
      ),
    apiKey,
  );

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "api_error",
    detail: "Helius returned an API error.",
    statusCode: null,
  });
});

test("marks absent mint and freeze authority fields as unknown", async () => {
  const service = new HeliusService(
    async () =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          result: {
            id: tokenAddress,
            token_info: { decimals: 6, supply: 1_000_000 },
          },
        }),
        { status: 200 },
      ),
    apiKey,
  );

  const result = await service.getTokenOnchainData(tokenAddress);
  assert.ok(result.ok);
  assert.equal(result.data.mintAuthority, null);
  assert.equal(result.data.mintAuthorityKnown, false);
  assert.equal(result.data.freezeAuthority, null);
  assert.equal(result.data.freezeAuthorityKnown, false);
});

test("returns a typed malformed-response error", async () => {
  const service = new HeliusService(
    async () => new Response("not json", { status: 200 }),
    apiKey,
  );

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "malformed_response",
    detail: "Helius returned an unreadable JSON response.",
    statusCode: null,
  });
});

test("returns a typed network error", async () => {
  const service = new HeliusService(async () => {
    throw new Error("offline");
  }, apiKey);

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "network_error",
    detail: "Unable to reach the Helius API.",
    statusCode: null,
  });
});

test("aborts a hung Helius request after the configured timeout", async () => {
  const service = new HeliusService(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    apiKey,
    1,
  );

  assert.deepEqual(await service.getTokenOnchainData(tokenAddress), {
    ok: false,
    reason: "network_error",
    detail: "The Helius request timed out.",
    statusCode: null,
  });
});
