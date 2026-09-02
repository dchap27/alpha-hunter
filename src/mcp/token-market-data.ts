import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { DexScreenerService } from "../services/dexscreener.js";

type TokenMarketDataToolResponse =
  | { status: "ok"; data: Record<string, unknown> }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

export function registerTokenMarketDataTool(
  server: McpServer,
  dexScreenerService = new DexScreenerService(fetch),
): void {
  server.registerTool(
    "get_token_market_data",
    {
      description:
        "Retrieves factual market data for a Solana token from DexScreener.",
      inputSchema: {
        tokenAddress: z.string().trim().min(1, "tokenAddress must not be empty."),
      },
    },
    async ({ tokenAddress }) => {
      const result = await dexScreenerService.getTokenMarketData(tokenAddress);
      const response: TokenMarketDataToolResponse = result.ok
        ? { status: "ok", data: result.data }
        : result.reason === "not_found"
          ? { status: "not_found", message: "No Solana market data was found for this token." }
          : {
              status: "error",
              message: "Market data could not be retrieved at this time.",
            };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
}
