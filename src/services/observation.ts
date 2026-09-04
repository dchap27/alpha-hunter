import { DEFAULT_WATCHLIST_LIMIT, MAX_WATCHLIST_LIMIT } from "../config/observation.js";
import { safeDivide } from "../analyzers/safeDivide.js";
import type { DexScreenerServiceResult, DexScreenerTokenData } from "../types/token-market-data.js";
import type { ObservationFailure, SnapshotComparison, TokenSnapshot, WatchlistEntry } from "../types/observation.js";
import { ObservationRepository } from "../repositories/observationRepository.js";

export class ObservationService {
  constructor(private readonly repository: ObservationRepository, private readonly marketService: { getTokenMarketData(address: string): Promise<DexScreenerServiceResult> }) {}

  addToWatchlist(tokenAddress: string, reason: string | null): { ok: true; data: WatchlistEntry } | ObservationFailure {
    try { return { ok: true, data: this.repository.addWatchlist(tokenAddress, reason) }; } catch { return { ok: false, reason: "storage_error", detail: "Watchlist storage failed.", statusCode: null }; }
  }

  getWatchlist(limit?: number): { ok: true; data: WatchlistEntry[] } | ObservationFailure {
    try { const bounded = Math.min(Math.max(Math.trunc(limit ?? DEFAULT_WATCHLIST_LIMIT), 1), MAX_WATCHLIST_LIMIT); return { ok: true, data: this.repository.getWatchlist(bounded) }; } catch { return { ok: false, reason: "storage_error", detail: "Watchlist storage failed.", statusCode: null }; }
  }

  async captureTokenSnapshot(tokenAddress: string): Promise<{ ok: true; data: TokenSnapshot } | ObservationFailure> {
    const market = await this.marketService.getTokenMarketData(tokenAddress);
    if (!market.ok) return market;
    try { return { ok: true, data: this.repository.addSnapshot(market.data) }; } catch { return { ok: false, reason: "storage_error", detail: "Snapshot storage failed.", statusCode: null }; }
  }

  compareTokenSnapshots(tokenAddress: string, fromId?: string, toId?: string): { ok: true; data: SnapshotComparison } | ObservationFailure {
    try {
      const snapshots = this.repository.getSnapshots(tokenAddress);
      if (snapshots.length < 2 && (fromId === undefined || toId === undefined)) return { ok: false, reason: "insufficient_data", detail: "At least two snapshots are required for comparison.", statusCode: null };
      const from = fromId === undefined ? snapshots[0] : this.repository.getSnapshot(Number(fromId));
      const to = toId === undefined ? snapshots[snapshots.length - 1] : this.repository.getSnapshot(Number(toId));
      if (!from || !to || from.tokenAddress !== tokenAddress || to.tokenAddress !== tokenAddress) return { ok: false, reason: "insufficient_data", detail: "The requested snapshots are not available for comparison.", statusCode: null };
      const change = (a: number | null, b: number | null) => { const ratio = safeDivide(b === null || a === null ? null : b - a, a); return ratio === null ? null : ratio * 100; };
      return { ok: true, data: { tokenAddress, fromSnapshotId: from.id, toSnapshotId: to.id, fromCapturedAt: from.capturedAt, toCapturedAt: to.capturedAt, changes: { pricePct: change(from.market.priceUsd, to.market.priceUsd), liquidityPct: change(from.market.liquidityUsd, to.market.liquidityUsd), marketCapPct: change(from.market.marketCap, to.market.marketCap), volumePct: change(from.market.volume24h, to.market.volume24h) } } };
    } catch { return { ok: false, reason: "storage_error", detail: "Snapshot comparison failed.", statusCode: null }; }
  }
}
