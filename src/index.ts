import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getHealth } from "./mcp/health.js";
import { registerAnalyzeTokenTool } from "./mcp/analyze-token.js";
import { registerTokenMarketDataTool } from "./mcp/token-market-data.js";
import { registerTokenOnchainDataTool } from "./mcp/token-onchain-data.js";
import { registerTokenHoldersTool } from "./mcp/token-holders.js";
import { registerDiscoverTokensTool } from "./mcp/discover-tokens.js";
import { DexScreenerService } from "./services/dexscreener.js";

export function createServer(
  dexScreenerService = new DexScreenerService(fetch),
): McpServer {
  const server = new McpServer({
    name: "alpha-hunter",
    version: "0.1.0",
  });

  server.registerTool(
    "health",
    { description: "Returns the Alpha Hunter service health status." },
    async () => {
      const health = getHealth();

      return {
        content: [{ type: "text", text: JSON.stringify(health) }],
        structuredContent: health,
      };
    },
  );

  registerTokenMarketDataTool(server, dexScreenerService);
  registerAnalyzeTokenTool(server, dexScreenerService);
  registerTokenOnchainDataTool(server);
  registerTokenHoldersTool(server);
  registerDiscoverTokensTool(server);

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error: unknown) => {
    console.error("Alpha Hunter MCP server failed to start:", error);
    process.exitCode = 1;
  });
}
