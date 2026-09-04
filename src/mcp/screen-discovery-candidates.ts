import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { screenDiscoveryCandidates } from "../analyzers/discoveryScreening.js";
import { DexScreenerCandidateSource } from "../services/candidate-source.js";
import { DexScreenerDiscoveryService } from "../services/dexscreener-discovery.js";
import { DexScreenerService } from "../services/dexscreener.js";

export function registerScreenDiscoveryCandidatesTool(
  server: McpServer,
  source = new DexScreenerCandidateSource(new DexScreenerDiscoveryService(fetch)),
  marketService = new DexScreenerService(fetch),
): void {
  server.registerTool("screen_discovery_candidates", {
    description: "Enriches and deterministically filters DexScreener candidate seeds using factual Solana market data; candidates are not recommendations or a score.",
    inputSchema: { limit: z.number().int().min(0).optional() },
  }, async ({ limit }) => {
    const result = await screenDiscoveryCandidates(source, marketService, { limit });
    const response = result.ok
      ? { status: "ok" as const, ...result.data }
      : { status: "error" as const, message: "Discovery candidate screening could not be completed." };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
