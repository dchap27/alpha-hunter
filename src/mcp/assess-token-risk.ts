import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { assessTokenRisk } from "../analyzers/tokenRisk.js";
import { HeliusService } from "../services/helius.js";
import { HeliusTokenAccountsService } from "../services/helius-token-accounts.js";
import type { HeliusServiceResult } from "../types/helius.js";
import type { HeliusTokenAccountsResult } from "../types/helius-token-accounts.js";

export function registerAssessTokenRiskTool(
  server: McpServer,
  authorityService: { getTokenOnchainData(address: string): Promise<HeliusServiceResult> } = new HeliusService(fetch, process.env.HELIUS_API_KEY),
  tokenAccountsService: { getTokenAccounts(params: { tokenAddress: string }): Promise<HeliusTokenAccountsResult> } = new HeliusTokenAccountsService(fetch, process.env.HELIUS_API_KEY),
): void {
  server.registerTool("assess_token_risk", {
    description: "Produces factual authority and holder-concentration observations for a Solana token; not a recommendation or score.",
    inputSchema: { tokenAddress: z.string().trim().min(1) },
  }, async ({ tokenAddress }) => {
    const result = await assessTokenRisk(tokenAddress, authorityService, tokenAccountsService);
    const response = result.ok
      ? { status: "ok" as const, data: result.data }
      : result.reason === "configuration_error"
        ? { status: "configuration_error" as const, message: "Helius is not configured. Set HELIUS_API_KEY to use this tool." }
        : { status: "error" as const, message: "Token observations could not be completed at this time." };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
