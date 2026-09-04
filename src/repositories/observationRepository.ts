import Database from "better-sqlite3";
import type { TokenSnapshot, WatchlistEntry } from "../types/observation.js";
import type { DexScreenerTokenData } from "../types/token-market-data.js";

export class ObservationRepository {
  constructor(readonly db: Database.Database) {
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist_entries (
        token_address TEXT PRIMARY KEY,
        added_at INTEGER NOT NULL,
        reason TEXT
      );
      CREATE TABLE IF NOT EXISTS token_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_address TEXT NOT NULL,
        captured_at INTEGER NOT NULL,
        price_usd REAL,
        liquidity_usd REAL,
        market_cap REAL,
        fdv REAL,
        volume24h REAL,
        buys24h REAL,
        sells24h REAL,
        pair_created_at REAL,
        FOREIGN KEY (token_address) REFERENCES watchlist_entries(token_address)
      );
      CREATE INDEX IF NOT EXISTS idx_token_snapshots_address_captured
        ON token_snapshots(token_address, captured_at);
    `);
  }

  addWatchlist(tokenAddress: string, reason: string | null, addedAt = Date.now()): WatchlistEntry {
    this.db.prepare("INSERT OR IGNORE INTO watchlist_entries (token_address, added_at, reason) VALUES (?, ?, ?)").run(tokenAddress, addedAt, reason);
    return this.getWatchlistEntry(tokenAddress)!;
  }

  getWatchlistEntry(tokenAddress: string): WatchlistEntry | null {
    const row = this.db.prepare("SELECT token_address as tokenAddress, added_at as addedAt, reason FROM watchlist_entries WHERE token_address = ?").get(tokenAddress) as WatchlistEntry | undefined;
    return row ?? null;
  }

  getWatchlist(limit: number): WatchlistEntry[] {
    return this.db.prepare("SELECT token_address as tokenAddress, added_at as addedAt, reason FROM watchlist_entries ORDER BY added_at ASC LIMIT ?").all(limit) as WatchlistEntry[];
  }

  addSnapshot(token: DexScreenerTokenData, capturedAt = Date.now()): TokenSnapshot {
    this.addWatchlist(token.tokenAddress, null, capturedAt);
    const result = this.db.prepare(`INSERT INTO token_snapshots (token_address, captured_at, price_usd, liquidity_usd, market_cap, fdv, volume24h, buys24h, sells24h, pair_created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(token.tokenAddress, capturedAt, token.priceUsd, token.liquidityUsd, token.marketCap, token.fdv, token.volume24h, token.buys24h, token.sells24h, token.pairCreatedAt);
    return this.getSnapshot(Number(result.lastInsertRowid))!;
  }

  getSnapshot(id: number): TokenSnapshot | null {
    const row = this.db.prepare("SELECT id, token_address as tokenAddress, captured_at as capturedAt, price_usd as priceUsd, liquidity_usd as liquidityUsd, market_cap as marketCap, fdv, volume24h, buys24h, sells24h, pair_created_at as pairCreatedAt FROM token_snapshots WHERE id = ?").get(id) as (Record<string, unknown> & { id: number; tokenAddress: string; capturedAt: number }) | undefined;
    if (!row) return null;
    const { id: snapshotId, tokenAddress, capturedAt, priceUsd, liquidityUsd, marketCap, fdv, volume24h, buys24h, sells24h, pairCreatedAt } = row;
    return { id: snapshotId, tokenAddress, capturedAt, market: { priceUsd: priceUsd as number | null, liquidityUsd: liquidityUsd as number | null, marketCap: marketCap as number | null, fdv: fdv as number | null, volume24h: volume24h as number | null, buys24h: buys24h as number | null, sells24h: sells24h as number | null, pairCreatedAt: pairCreatedAt as number | null } };
  }

  getSnapshots(tokenAddress: string): TokenSnapshot[] {
    const ids = this.db.prepare("SELECT id FROM token_snapshots WHERE token_address = ? ORDER BY captured_at ASC, id ASC").all(tokenAddress) as { id: number }[];
    return ids.map(({ id }) => this.getSnapshot(id)!).filter(Boolean);
  }
}
