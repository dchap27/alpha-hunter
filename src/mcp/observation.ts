import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDatabasePath, DEFAULT_WATCHLIST_LIMIT, MAX_WATCHLIST_LIMIT } from "../config/observation.js";
import { ObservationRepository } from "../repositories/observationRepository.js";
import { ObservationService } from "../services/observation.js";
import { DexScreenerService } from "../services/dexscreener.js";

export function registerObservationTools(server: McpServer, service = createDefaultObservationService()): void {
  server.registerTool("add_to_watchlist", { description: "Adds a Solana token to the local observation watchlist idempotently.", inputSchema: { tokenAddress: z.string().trim().min(1), reason: z.string().optional() } }, async ({ tokenAddress, reason }) => respond(await service.addToWatchlist(tokenAddress, reason ?? null)));
  server.registerTool("get_watchlist", { description: "Returns locally observed Solana tokens.", inputSchema: { limit: z.number().int().min(1).max(MAX_WATCHLIST_LIMIT).optional() } }, async ({ limit }) => respond(await service.getWatchlist(limit ?? DEFAULT_WATCHLIST_LIMIT)));
  server.registerTool("capture_token_snapshot", { description: "Captures factual DexScreener market data for a token; automatically adds it to the watchlist if needed.", inputSchema: { tokenAddress: z.string().trim().min(1) } }, async ({ tokenAddress }) => respond(await service.captureTokenSnapshot(tokenAddress)));
  server.registerTool("compare_token_snapshots", { description: "Compares factual market-data snapshots; omitted IDs compare earliest and latest observations.", inputSchema: { tokenAddress: z.string().trim().min(1), fromSnapshotId: z.string().optional(), toSnapshotId: z.string().optional() } }, async ({ tokenAddress, fromSnapshotId, toSnapshotId }) => respond(service.compareTokenSnapshots(tokenAddress, fromSnapshotId, toSnapshotId)));
}

function createDefaultObservationService(): ObservationService {
  const databasePath = getDatabasePath();
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  return new ObservationService(new ObservationRepository(new Database(databasePath)), new DexScreenerService(fetch));
}

function respond(value: unknown) {
  if (isFailure(value)) {
    const status = value.reason === "insufficient_data" ? "insufficient_data" : value.reason === "not_found" ? "not_found" : "error";
    const response = { status, message: value.detail };
    return { content: [{ type: "text" as const, text: JSON.stringify(response) }], structuredContent: response };
  }
  const response = { status: "ok" as const, data: isSuccess(value) ? value.data : value };
  return { content: [{ type: "text" as const, text: JSON.stringify(response) }], structuredContent: response };
}
function isFailure(value: unknown): value is { ok: false; reason: string; detail: string } { return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false; }
function isSuccess(value: unknown): value is { ok: true; data: unknown } { return typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true && "data" in value; }
