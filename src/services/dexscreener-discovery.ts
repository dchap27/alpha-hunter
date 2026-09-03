import type { DexScreenerFetcher } from "./dexscreener.js";
import type {
  DiscoverySource,
  TokenDiscoveryCandidate,
  TokenDiscoveryData,
  TokenDiscoveryResult,
} from "../types/token-discovery.js";

const BASE_URL = "https://api.dexscreener.com";
const DEFAULT_TIMEOUT_MS = 8_000;
type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

interface SourceRecord extends RecordValue {
  source: DiscoverySource;
  boostAmount: number | null;
  boostTotalAmount: number | null;
}

async function fetchSource(fetcher: DexScreenerFetcher, path: string, source: DiscoverySource, timeoutMs: number): Promise<SourceRecord[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${BASE_URL}${path}`, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return null;
    return body.filter(isRecord).map((item) => ({
      ...item,
      source,
      boostAmount: numberValue(item.amount),
      boostTotalAmount: numberValue(item.totalAmount),
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export class DexScreenerDiscoveryService {
  constructor(
    private readonly fetcher: DexScreenerFetcher,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async discoverTokens(options: { sources?: DiscoverySource[] | undefined; limit?: number | undefined } = {}): Promise<TokenDiscoveryResult> {
    const requested = options.sources !== undefined ? [...new Set(options.sources)] : ["profile", "boosted_latest", "boosted_top"] as DiscoverySource[];
    const paths: Record<DiscoverySource, string> = {
      profile: "/token-profiles/latest/v1",
      boosted_latest: "/token-boosts/latest/v1",
      boosted_top: "/token-boosts/top/v1",
    };
    const status: TokenDiscoveryData["sourcesQueried"] = {
      profile: requested.includes("profile") ? "error" : "skipped",
      boostedLatest: requested.includes("boosted_latest") ? "error" : "skipped",
      boostedTop: requested.includes("boosted_top") ? "error" : "skipped",
    };
    const sourceResults = await Promise.all(requested.map(async (source) => {
      const result = await fetchSource(this.fetcher, paths[source], source, this.timeoutMs);
      const key = source === "profile" ? "profile" : source === "boosted_latest" ? "boostedLatest" : "boostedTop";
      status[key] = result ? "ok" : "error";
      return result ?? [];
    }));
    const records = sourceResults.flat();
    if (requested.length > 0 && requested.every((source) => status[source === "profile" ? "profile" : source === "boosted_latest" ? "boostedLatest" : "boostedTop"] === "error")) {
      return { ok: false, reason: "error", detail: "All requested DexScreener discovery sources failed.", statusCode: null };
    }

    const merged = new Map<string, TokenDiscoveryCandidate>();
    for (const record of records) {
      const tokenAddress = stringValue(record.tokenAddress);
      if (!tokenAddress || record.chainId !== "solana") continue;
      const existing = merged.get(tokenAddress);
      if (!existing) {
        merged.set(tokenAddress, {
          tokenAddress, chainId: "solana", url: stringValue(record.url), description: stringValue(record.description),
          sourceTypes: [record.source], boostAmount: record.boostAmount, boostTotalAmount: record.boostTotalAmount,
        });
      } else {
        if (!existing.sourceTypes.includes(record.source)) existing.sourceTypes.push(record.source);
        if (record.source === "boosted_top") {
          // When boost values conflict, the top-boost source is preferred explicitly.
          existing.boostAmount = record.boostAmount;
          existing.boostTotalAmount = record.boostTotalAmount;
        } else if (existing.boostAmount === null && record.boostAmount !== null) {
          existing.boostAmount = record.boostAmount;
          existing.boostTotalAmount = record.boostTotalAmount;
        }
        existing.url ??= stringValue(record.url);
        existing.description ??= stringValue(record.description);
      }
    }
    const limit = options.limit === undefined ? undefined : Math.max(0, Math.trunc(options.limit));
    const candidates = [...merged.values()].slice(0, limit);
    const limitations = [
      "Candidates are a seed list from self-submitted profiles and paid boosts, not a trending or volume-ranked feed.",
      "Boosted candidates reflect paid promotion, not organic activity.",
    ];
    if (status.profile === "error") limitations.push("The DexScreener profile source failed.");
    if (status.boostedLatest === "error") limitations.push("The DexScreener latest-boost source failed.");
    if (status.boostedTop === "error") limitations.push("The DexScreener top-boost source failed.");
    return { ok: true, data: { candidates, sourcesQueried: status, limitations } };
  }
}
