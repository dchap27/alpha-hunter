import type {
  HeliusTokenAccount,
  HeliusTokenAccountsData,
  HeliusTokenAccountsResult,
} from "../types/helius-token-accounts.js";
import { HeliusService, type HeliusFetcher } from "./helius.js";
import { DEFAULT_HOLDER_LIMIT, MAX_HOLDER_LIMIT } from "../config/holderLimits.js";

const HELIUS_MAINNET_RPC_URL = "https://mainnet.helius-rpc.com/";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeAccount(value: unknown): HeliusTokenAccount | null {
  if (!isRecord(value)) return null;
  const tokenAccountAddress = asString(value.address);
  const mint = asString(value.mint);
  const ownerAddress = asString(value.owner);
  const amount = asNumber(value.amount);
  if (!tokenAccountAddress || !mint || !ownerAddress || amount === null) return null;
  return {
    tokenAccountAddress,
    mint,
    ownerAddress,
    amount,
    delegatedAmount: asNumber(value.delegated_amount),
    frozen: asBoolean(value.frozen),
    burnt: asBoolean(value.burnt),
    decimals: null,
    amountUi: null,
    amountPercentageOfSupply: null,
  };
}

export function normalizeTokenAccounts(
  value: unknown,
  requestedTokenAddress: string,
  requestedOwner: string | null,
  supply: number | null,
  decimals: number | null,
): HeliusTokenAccountsData | null {
  if (!isRecord(value) || !Array.isArray(value.token_accounts)) return null;
  const accounts = value.token_accounts
    .map(normalizeAccount)
    .filter((account): account is HeliusTokenAccount => account !== null);
  const totalSupplyUi = supply !== null && decimals !== null ? supply / 10 ** decimals : null;
  const withPercentages = accounts.map((account) => {
    const amountUi = decimals !== null ? account.amount / 10 ** decimals : null;
    const amountPercentageOfSupply = amountUi !== null && totalSupplyUi !== null && totalSupplyUi > 0
      ? (amountUi / totalSupplyUi) * 100
      : null;
    return {
      ...account,
      decimals,
      amountUi: amountUi !== null && Number.isFinite(amountUi) ? amountUi : null,
      amountPercentageOfSupply: amountPercentageOfSupply !== null && Number.isFinite(amountPercentageOfSupply)
        ? amountPercentageOfSupply
        : null,
    };
  }).sort((a, b) => b.amount - a.amount);
  const totalAccountsAvailable = asNumber(value.total);
  const percentages = withPercentages.map((account) => account.amountPercentageOfSupply);
  const sumPercentages = (count: number): number | null => {
    const selected = percentages.slice(0, count);
    if (selected.some((percentage) => percentage === null)) return null;
    const sum = selected.reduce<number>((total, percentage) => total + (percentage as number), 0);
    return Number.isFinite(sum) ? sum : null;
  };
  const limitations = [
    "Results are token accounts, not unique people or entities; a single owner may control multiple accounts.",
  ];
  if (supply === null || decimals === null) {
    limitations.push("Supply-based amounts and percentages are unavailable because mint supply or decimals could not be retrieved.");
  }
  if (totalAccountsAvailable !== null && totalAccountsAvailable > withPercentages.length) {
    limitations.push("Additional token accounts exist beyond the returned page.");
  }
  return {
    tokenAddress: requestedTokenAddress,
    owner: requestedOwner,
    totalSupplyUi: totalSupplyUi !== null && Number.isFinite(totalSupplyUi) ? totalSupplyUi : null,
    decimals,
    limit: asNumber(value.limit),
    cursor: asString(value.cursor),
    lastIndexedSlot: asNumber(value.last_indexed_slot),
    accounts: withPercentages,
    summary: {
      returnedAccountCount: withPercentages.length,
      totalAccountsAvailable,
      largestReturnedAccountPercentage: percentages[0] ?? null,
      top5ReturnedAccountsPercentage: sumPercentages(5),
      top10ReturnedAccountsPercentage: sumPercentages(10),
    },
    limitations,
  };
}

export class HeliusTokenAccountsService {
  private readonly assetService: HeliusService;

  constructor(
    private readonly fetcher: HeliusFetcher,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs = 8_000,
    assetService?: HeliusService,
  ) {
    this.assetService = assetService ?? new HeliusService(fetcher, apiKey, timeoutMs);
  }

  async getTokenAccounts(params: {
    tokenAddress: string;
    owner?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    cursor?: string | undefined;
  }): Promise<HeliusTokenAccountsResult> {
    const apiKey = this.apiKey?.trim();
    if (!apiKey) {
      return {
        ok: false,
        reason: "configuration_error",
        detail: "HELIUS_API_KEY is not configured.",
        statusCode: null,
      };
    }

    const assetResult = await this.assetService.getTokenOnchainData(params.tokenAddress);
    if (!assetResult.ok && assetResult.reason === "configuration_error") return assetResult;

    const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_HOLDER_LIMIT), 1), MAX_HOLDER_LIMIT);
    const requestParams: Record<string, string | number> = { mint: params.tokenAddress.trim(), limit };
    if (params.owner?.trim()) requestParams.owner = params.owner.trim();
    if (params.page !== undefined) requestParams.page = Math.max(1, Math.trunc(params.page));
    if (params.cursor?.trim()) requestParams.cursor = params.cursor.trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetcher(`${HELIUS_MAINNET_RPC_URL}?api-key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "alpha-hunter", method: "getTokenAccounts", params: requestParams }),
        signal: controller.signal,
      });
    } catch {
      return {
        ok: false,
        reason: "network_error",
        detail: controller.signal.aborted ? "The Helius request timed out." : "Unable to reach the Helius API.",
        statusCode: null,
      };
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 429) return { ok: false, reason: "rate_limited", detail: "Helius rate limit exceeded.", statusCode: 429 };
    if (response.status === 404) return { ok: false, reason: "not_found", detail: "Helius found no token-account data.", statusCode: 404 };
    if (!response.ok) return { ok: false, reason: "http_error", detail: `Helius API request failed with HTTP ${response.status}.`, statusCode: response.status };

    let body: unknown;
    try { body = await response.json(); } catch {
      return { ok: false, reason: "malformed_response", detail: "Helius returned an unreadable JSON response.", statusCode: null };
    }
    if (!isRecord(body)) return { ok: false, reason: "malformed_response", detail: "Helius returned an unexpected response shape.", statusCode: null };
    if (isRecord(body.error)) return { ok: false, reason: "api_error", detail: "Helius returned an API error.", statusCode: null };
    const data = normalizeTokenAccounts(
      body.result,
      params.tokenAddress.trim(),
      params.owner?.trim() || null,
      assetResult.ok ? assetResult.data.supply : null,
      assetResult.ok ? assetResult.data.decimals : null,
    );
    if (!data) return { ok: false, reason: "malformed_response", detail: "Helius returned an unexpected token-account response.", statusCode: null };
    if (data.accounts.length === 0) return { ok: false, reason: "not_found", detail: "Helius found no token accounts for this query.", statusCode: null };
    return { ok: true, data };
  }
}
