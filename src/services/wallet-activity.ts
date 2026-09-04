import { DEFAULT_WALLET_ACTIVITY_LIMIT, MAX_WALLET_ACTIVITY_LIMIT } from "../config/walletActivityLimits.js";
import type { HeliusFetcher } from "./helius.js";
import type { WalletActivityData, WalletActivityItem, WalletActivityServiceResult } from "../types/wallet-activity.js";

const HELIUS_MAINNET_RPC_URL = "https://mainnet.helius-rpc.com/";
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function asString(value: unknown): string | null { return typeof value === "string" ? value : null; }
function asNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function normalizeActivity(value: unknown, walletAddress: string): WalletActivityItem | null {
  if (!isRecord(value)) return null;
  const signature = asString(value.signature);
  const type = asString(value.type);
  if (!signature || !type) return null;
  const from = asString(value.fromUserAccount);
  const to = asString(value.toUserAccount);
  const direction = to === walletAddress && from !== walletAddress ? "in" : from === walletAddress && to !== walletAddress ? "out" : null;
  const counterparty = direction === "in" ? from : direction === "out" ? to : null;
  return {
    signature,
    timestamp: asNumber(value.blockTime),
    slot: asNumber(value.slot),
    type,
    mint: asString(value.mint),
    direction,
    counterparty,
    amountRaw: asString(value.amount),
    decimals: asNumber(value.decimals),
    uiAmount: asString(value.uiAmount),
    confirmationStatus: asString(value.confirmationStatus),
  };
}

export class WalletActivityService {
  constructor(private readonly fetcher: HeliusFetcher, private readonly apiKey: string | undefined, private readonly timeoutMs = 8_000) {}

  async getWalletActivity(walletAddress: string, limit?: number): Promise<WalletActivityServiceResult> {
    const apiKey = this.apiKey?.trim();
    if (!apiKey) return { ok: false, reason: "configuration_error", detail: "HELIUS_API_KEY is not configured.", statusCode: null };
    const requestedLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_WALLET_ACTIVITY_LIMIT;
    const boundedLimit = Math.min(Math.max(requestedLimit, 1), MAX_WALLET_ACTIVITY_LIMIT);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`${HELIUS_MAINNET_RPC_URL}?api-key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "alpha-hunter", method: "getTransfersByAddress", params: [walletAddress.trim(), { limit: boundedLimit }] }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, reason: "network_error", detail: controller.signal.aborted ? "The Helius request timed out." : "Unable to reach the Helius API.", statusCode: null };
    } finally { clearTimeout(timeout); }
    if (response.status === 404) return { ok: false, reason: "not_found", detail: "Helius has no wallet activity data for this address.", statusCode: 404 };
    if (!response.ok) return { ok: false, reason: "http_error", detail: `Helius API request failed with HTTP ${response.status}.`, statusCode: response.status };
    let body: unknown;
    try { body = await response.json(); } catch { return { ok: false, reason: "malformed_response", detail: "Helius returned an unreadable JSON response.", statusCode: null }; }
    if (!isRecord(body)) return { ok: false, reason: "malformed_response", detail: "Helius returned an unexpected response shape.", statusCode: null };
    if (isRecord(body.error)) return { ok: false, reason: "api_error", detail: "Helius returned an API error.", statusCode: null };
    if (!isRecord(body.result) || !Array.isArray(body.result.data)) return { ok: false, reason: "malformed_response", detail: "Helius returned an unexpected wallet activity response.", statusCode: null };
    const activities = body.result.data.flatMap((entry): WalletActivityItem[] => { const item = normalizeActivity(entry, walletAddress.trim()); return item ? [item] : []; });
    const pagination = asString(body.result.paginationToken);
    const data: WalletActivityData = { walletAddress: walletAddress.trim(), activities, pagination: { token: pagination }, limitations: ["Transfer types are passed through from Helius; no swap or trade semantics are inferred.", "Wallet activity data does not by itself establish wallet profitability, intelligence, or future trading success."] };
    return { ok: true, data };
  }
}
