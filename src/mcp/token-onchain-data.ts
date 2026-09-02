import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HeliusService } from "../services/helius.js";

type TokenOnchainDataToolResponse =
  | { status: "ok"; data: Record<string, unknown> }
  | { status: "not_found"; message: string }
  | { status: "configuration_error"; message: string }
  | { status: "error"; message: string };

export function registerTokenOnchainDataTool(
  server: McpServer,
  heliusService = new HeliusService(fetch, process.env.HELIUS_API_KEY),
): void {
  server.registerTool(
    "get_token_onchain_data",
    {
      description:
        "Retrieves factual Solana token identity and onchain metadata from Helius.",
      inputSchema: {
        tokenAddress: z.string().trim().min(1, "tokenAddress must not be empty."),
      },
    },
    async ({ tokenAddress }) => {
      const result = await heliusService.getTokenOnchainData(tokenAddress);
      const response: TokenOnchainDataToolResponse = result.ok
        ? { status: "ok", data: result.data }
        : result.reason === "not_found"
          ? { status: "not_found", message: "No onchain asset data was found for this token." }
          : result.reason === "configuration_error"
            ? {
                status: "configuration_error",
                message: "Helius is not configured. Set HELIUS_API_KEY to use this tool.",
              }
            : {
                status: "error",
                message: "Onchain token data could not be retrieved at this time.",
              };

      return {
        content: [{ type: "text", text: JSON.stringify(response) }],
        structuredContent: response,
      };
    },
  );
}
