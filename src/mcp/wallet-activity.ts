import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MAX_WALLET_ACTIVITY_LIMIT, DEFAULT_WALLET_ACTIVITY_LIMIT } from "../config/walletActivityLimits.js";
import { WalletActivityService } from "../services/wallet-activity.js";

export function registerWalletActivityTool(server: McpServer, service = new WalletActivityService(fetch, process.env.HELIUS_API_KEY)): void {
  server.registerTool("get_wallet_activity", { description: "Retrieves factual Solana wallet transfer activity from Helius; provider type values are passed through without trade interpretation.", inputSchema: { walletAddress: z.string().trim().min(1, "walletAddress must not be empty."), limit: z.number().int().min(1).max(MAX_WALLET_ACTIVITY_LIMIT).optional() } }, async ({ walletAddress, limit }) => {
    const result = await service.getWalletActivity(walletAddress, limit ?? DEFAULT_WALLET_ACTIVITY_LIMIT);
    const response = result.ok ? { status: "ok" as const, data: result.data } : result.reason === "configuration_error" ? { status: "configuration_error" as const, message: "Helius is not configured. Set HELIUS_API_KEY to use this tool." } : result.reason === "not_found" ? { status: "not_found" as const, message: "No wallet activity data was found for this address." } : { status: "error" as const, message: "Wallet activity could not be retrieved at this time." };
    return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
  });
}
