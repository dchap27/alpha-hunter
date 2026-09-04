import assert from "node:assert/strict";
import test from "node:test";
import { WalletActivityService } from "../src/services/wallet-activity.js";

const wallet = "Wallet111111111111111111111111111111111111111";
const other = "Other1111111111111111111111111111111111111111";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const activity = (overrides: Record<string, unknown> = {}) => ({ signature: "sig", slot: 10, blockTime: 100, type: "transfer", fromUserAccount: other, toUserAccount: wallet, mint: "Mint", amount: "2500000", decimals: 6, uiAmount: "2.5", confirmationStatus: "finalized", ...overrides });

test("normalizes transfers, direction, edge cases, and positional params", async () => {
  let request: RequestInit | undefined;
  const service = new WalletActivityService(async (_input, init) => { request = init; return response({ result: { data: [activity(), activity({ signature: "mint", type: "mint", fromUserAccount: null }), activity({ signature: "burn", type: "burn", toUserAccount: null, fromUserAccount: wallet })], paginationToken: "next" } }); }, "key");
  const result = await service.getWalletActivity(wallet, 7);
  assert.ok(result.ok);
  assert.equal(result.data.activities[0]?.direction, "in");
  assert.equal(result.data.activities[0]?.counterparty, other);
  assert.equal(result.data.activities[1]?.direction, "in");
  assert.equal(result.data.activities[1]?.counterparty, null);
  assert.equal(result.data.activities[2]?.direction, "out");
  assert.equal(result.data.activities[2]?.counterparty, null);
  assert.equal(result.data.pagination.token, "next");
  assert.deepEqual(JSON.parse(String(request?.body)).params, [wallet, { limit: 7 }]);
});

test("returns empty history successfully and clamps limits", async () => {
  let body = "";
  const service = new WalletActivityService(async (_input, init) => { body = String(init?.body); return response({ result: { data: [] } }); }, "key");
  const result = await service.getWalletActivity(wallet, 99999);
  assert.ok(result.ok);
  assert.deepEqual(result.data.activities, []);
  assert.equal(JSON.parse(body).params[1].limit, 100);
});

test("handles configuration, HTTP, malformed, network, and timeout failures", async () => {
  const reasonOf = (result: Awaited<ReturnType<WalletActivityService["getWalletActivity"]>>) => {
    if (result.ok) throw new Error("expected failure");
    return result;
  };
  let calls = 0;
  const missing = new WalletActivityService(async () => { calls++; return response({}); }, "");
  assert.equal(reasonOf(await missing.getWalletActivity(wallet)).reason, "configuration_error"); assert.equal(calls, 0);
  assert.equal(reasonOf(await new WalletActivityService(async () => response({}, 403), "key").getWalletActivity(wallet)).reason, "http_error");
  assert.equal(reasonOf(await new WalletActivityService(async () => new Response("bad", { status: 200 }), "key").getWalletActivity(wallet)).reason, "malformed_response");
  assert.equal(reasonOf(await new WalletActivityService(async () => { throw new Error("down"); }, "key").getWalletActivity(wallet)).reason, "network_error");
  const timeout = new WalletActivityService((_input, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }), "key", 5);
  const timed = await timeout.getWalletActivity(wallet);
  const timedFailure = reasonOf(timed);
  assert.equal(timedFailure.reason, "network_error");
  assert.match(timedFailure.detail, /timed out/);
});
