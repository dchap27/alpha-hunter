import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HeliusTokenAccountsService } from "../services/helius-token-accounts.js";

export function registerTokenHoldersTool(
  server: McpServer,
  service = new HeliusTokenAccountsService(fetch, process.env.HELIUS_API_KEY),
): void {
  server.registerTool("get_token_holders", {
    description: "Retrieves factual Helius token-account balances for a Solana token. Results are token accounts, not unique people or entities.",
    inputSchema: {
      tokenAddress: z.string().trim().min(1),
      limit: z.number().int().min(1).optional(),
    },
  }, async (input) => {
    const result = await service.getTokenAccounts(input);
    const response = result.ok
      ? { status: "ok" as const, data: result.data }
      : result.reason === "not_found"
        ? { status: "not_found" as const, message: "No token accounts were found for this token." }
        : result.reason === "configuration_error"
          ? { status: "configuration_error" as const, message: "Helius is not configured. Set HELIUS_API_KEY to use this tool." }
          : { status: "error" as const, message: result.reason === "rate_limited" ? "Helius rate limit exceeded. Try again later." : "Token account data could not be retrieved at this time." };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
