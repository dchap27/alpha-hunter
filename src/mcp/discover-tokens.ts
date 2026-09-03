import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DexScreenerDiscoveryService } from "../services/dexscreener-discovery.js";

export function registerDiscoverTokensTool(server: McpServer, service = new DexScreenerDiscoveryService(fetch)): void {
  server.registerTool("discover_tokens", {
    description: "Returns a Solana candidate seed list from DexScreener profiles and paid boosts; this is not a trending or volume-ranked feed.",
    inputSchema: {
      sources: z.array(z.enum(["profile", "boosted_latest", "boosted_top"])).optional(),
      limit: z.number().int().min(0).optional(),
    },
  }, async (input) => {
    const result = await service.discoverTokens(input);
    const response = result.ok
      ? { status: "ok" as const, data: result.data }
      : { status: "error" as const, message: "Token discovery sources could not be reached." };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
