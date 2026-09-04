import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { investigateToken } from "../analyzers/tokenInvestigation.js";
import { DexScreenerService } from "../services/dexscreener.js";
import { HeliusService } from "../services/helius.js";
import { HeliusTokenAccountsService } from "../services/helius-token-accounts.js";
import { ObservationRepository } from "../repositories/observationRepository.js";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDatabasePath } from "../config/observation.js";

export function registerInvestigateTokenTool(server: McpServer): void {
  server.registerTool("investigate_token", { description: "Produces a factual market and onchain investigation report with graceful degradation; not investment advice or trading instructions.", inputSchema: { tokenAddress: z.string().trim().min(1) } }, async ({ tokenAddress }) => {
    const dbPath = getDatabasePath();
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const repository = new ObservationRepository(new Database(dbPath));
    const report = await investigateToken(tokenAddress, new DexScreenerService(fetch), new HeliusService(fetch, process.env.HELIUS_API_KEY), new HeliusTokenAccountsService(fetch, process.env.HELIUS_API_KEY), repository);
    const response = { status: report.status, data: report };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
