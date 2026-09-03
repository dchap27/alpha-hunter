import assert from "node:assert/strict";
import test from "node:test";
import { HeliusTokenAccountsService } from "../src/services/helius-token-accounts.js";

const mint = "Mint111111111111111111111111111111111111111";
const asset = { result: { id: mint, token_info: { supply: 1_000_000, decimals: 2 } } };

test("reuses getAsset decimals/supply and computes UI amounts and supply percentages", async () => {
  let calls = 0;
  const service = new HeliusTokenAccountsService(async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { method: string };
    return body.method === "getAsset"
      ? new Response(JSON.stringify(asset), { status: 200 })
      : new Response(JSON.stringify({ result: { total: 2, limit: 100, cursor: "next", last_indexed_slot: 123, token_accounts: [
          { address: "account-a", mint, owner: "owner-a", amount: 75, delegated_amount: 2, frozen: false, burnt: false },
          { address: "account-b", mint, owner: "owner-b", amount: 25, frozen: true },
        ] } }), { status: 200 });
  }, "secret");
  const result = await service.getTokenAccounts({ tokenAddress: mint, owner: "owner", page: 2, limit: 1001, cursor: "cursor" });
  assert.ok(result.ok);
  assert.equal(calls, 2);
  assert.equal(result.data.accounts[0]?.amountUi, 0.75);
  assert.equal(result.data.accounts[0]?.amountPercentageOfSupply, 0.0075);
  assert.equal(result.data.summary.largestReturnedAccountPercentage, 0.0075);
  assert.equal(result.data.summary.top5ReturnedAccountsPercentage, 0.01);
  assert.equal(result.data.summary.top10ReturnedAccountsPercentage, 0.01);
  assert.equal(result.data.summary.returnedAccountCount, 2);
  assert.equal(result.data.totalSupplyUi, 10_000);
  assert.equal(result.data.decimals, 2);
});

test("leaves UI amounts and supply percentages null when asset decimals or supply are unavailable", async () => {
  const service = new HeliusTokenAccountsService(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    return body.method === "getAsset"
      ? new Response(JSON.stringify({ result: { id: mint, token_info: {} } }), { status: 200 })
      : new Response(JSON.stringify({ result: { token_accounts: [{ address: "a", mint, owner: "o", amount: 10 }] } }), { status: 200 });
  }, "key");
  const result = await service.getTokenAccounts({ tokenAddress: mint });
  assert.ok(result.ok);
  assert.equal(result.data.accounts[0]?.amountUi, null);
  assert.equal(result.data.accounts[0]?.amountPercentageOfSupply, null);
  assert.equal(result.data.summary.largestReturnedAccountPercentage, null);
  assert.equal(result.data.summary.top5ReturnedAccountsPercentage, null);
});

test("sorts accounts descending when the API returns ascending balances", async () => {
  let call = 0;
  const service = new HeliusTokenAccountsService(async (_url, init) => {
    call += 1;
    const body = JSON.parse(String(init?.body)) as { method: string };
    return body.method === "getAsset"
      ? new Response(JSON.stringify(asset), { status: 200 })
      : new Response(JSON.stringify({ result: { token_accounts: [
          { address: "small", mint, owner: "o1", amount: 1 },
          { address: "large", mint, owner: "o2", amount: 100 },
          { address: "medium", mint, owner: "o3", amount: 10 },
        ] } }), { status: 200 });
  }, "key");
  const result = await service.getTokenAccounts({ tokenAddress: mint });
  assert.ok(result.ok);
  assert.deepEqual(result.data.accounts.map((account) => account.tokenAccountAddress), ["large", "medium", "small"]);
  assert.equal(call, 2);
});

test("still returns accounts when asset metadata is unavailable", async () => {
  let calls = 0;
  const service = new HeliusTokenAccountsService(async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ result: null }), { status: 200 })
      : new Response(JSON.stringify({ result: { token_accounts: [
          { address: "a", mint, owner: "o", amount: 10 },
        ] } }), { status: 200 });
  }, "key");
  const result = await service.getTokenAccounts({ tokenAddress: mint });
  assert.ok(result.ok);
  assert.equal(result.data.accounts.length, 1);
  assert.equal(result.data.accounts[0]?.amountPercentageOfSupply, null);
  assert.equal(calls, 2);
});

test("returns configuration, rate-limit, malformed, network, and timeout results", async () => {
  const missing = new HeliusTokenAccountsService(async () => new Response(), undefined);
  const missingResult = await missing.getTokenAccounts({ tokenAddress: mint });
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) assert.equal(missingResult.reason, "configuration_error");

  const rate = new HeliusTokenAccountsService(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { method: string };
    return body.method === "getAsset" ? new Response(JSON.stringify(asset), { status: 200 }) : new Response(null, { status: 429 });
  }, "key");
  const rateResult = await rate.getTokenAccounts({ tokenAddress: mint });
  assert.equal(rateResult.ok, false);
  if (!rateResult.ok) assert.equal(rateResult.reason, "rate_limited");

  const malformed = new HeliusTokenAccountsService(async () => new Response("bad", { status: 200 }), "key");
  const malformedResult = await malformed.getTokenAccounts({ tokenAddress: mint });
  assert.equal(malformedResult.ok, false);
  if (!malformedResult.ok) assert.equal(malformedResult.reason, "malformed_response");

  const network = new HeliusTokenAccountsService(async () => { throw new Error("offline"); }, "key");
  const networkResult = await network.getTokenAccounts({ tokenAddress: mint });
  assert.equal(networkResult.ok, false);
  if (!networkResult.ok) assert.equal(networkResult.reason, "network_error");

  const timeout = new HeliusTokenAccountsService(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  }), "key", 1);
  const timeoutResult = await timeout.getTokenAccounts({ tokenAddress: mint });
  assert.equal(timeoutResult.ok, false);
  if (!timeoutResult.ok) assert.equal(timeoutResult.reason, "network_error");
});
