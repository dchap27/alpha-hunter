import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { analyzeDexScreenerResult } from "../analyzers/tokenAnalysis.js";
import { DexScreenerService } from "../services/dexscreener.js";

type AnalyzeTokenToolResponse =
  | { status: "ok"; data: Record<string, unknown> }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

export function registerAnalyzeTokenTool(
  server: McpServer,
  dexScreenerService = new DexScreenerService(fetch),
): void {
  server.registerTool(
    "analyze_token",
    {
      description:
        "Generates a deterministic, factual analysis of DexScreener market data for a Solana token. Not investment advice.",
      inputSchema: {
        tokenAddress: z.string().trim().min(1, "tokenAddress must not be empty."),
      },
    },
    async ({ tokenAddress }) => {
      const analysisResult = analyzeDexScreenerResult(
        await dexScreenerService.getTokenMarketData(tokenAddress),
      );
      const response: AnalyzeTokenToolResponse = analysisResult.ok
        ? { status: "ok", data: analysisResult.data }
        : analysisResult.reason === "not_found"
          ? { status: "not_found", message: "No Solana market data was found for this token." }
          : {
              status: "error",
              message: "Token analysis could not be completed at this time.",
            };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
}
