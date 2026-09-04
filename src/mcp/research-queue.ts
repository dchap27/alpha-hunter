import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDatabasePath } from "../config/observation.js";
import { MAX_RESEARCH_QUEUE_LIMIT, DEFAULT_RESEARCH_QUEUE_LIMIT } from "../config/researchQueueLimits.js";
import { ResearchQueueRepository } from "../repositories/researchQueueRepository.js";
import { ResearchQueueService } from "../services/research-queue.js";
import type { ResearchPriority, WorkflowStatus } from "../types/research-queue.js";

const statuses = ["DISCOVERED", "SCREENED", "INVESTIGATED", "WATCHING", "ARCHIVED"] as const;
const priorities = ["LOW", "MEDIUM", "HIGH"] as const;
export function registerResearchQueueTools(server: McpServer, service = createService()): void {
  const address = z.string().trim().min(1);
  const status = z.enum(statuses); const priority = z.enum(priorities);
  server.registerTool("add_to_research_queue", { description: "Adds a token to the research workflow; status and priority are organizational labels only.", inputSchema: { tokenAddress: address, status: status.optional(), priority: priority.optional(), reason: z.string().optional() } }, async (input) => respond(service.add(input.tokenAddress, input.status as WorkflowStatus | undefined, input.priority as ResearchPriority | undefined, input.reason ?? null)));
  server.registerTool("update_research_status", { description: "Updates a research workflow status label.", inputSchema: { tokenAddress: address, status } }, async ({ tokenAddress, status: value }) => respond(service.updateStatus(tokenAddress, value)));
  server.registerTool("update_research_priority", { description: "Updates a research priority label.", inputSchema: { tokenAddress: address, priority } }, async ({ tokenAddress, priority: value }) => respond(service.updatePriority(tokenAddress, value)));
  server.registerTool("get_research_queue", { description: "Lists research queue entries ordered by HIGH, MEDIUM, then LOW priority.", inputSchema: { status: status.optional(), priority: priority.optional(), limit: z.number().int().min(1).max(MAX_RESEARCH_QUEUE_LIMIT).optional() } }, async ({ status: value, priority: p, limit }) => respond(service.list(value, p, limit ?? DEFAULT_RESEARCH_QUEUE_LIMIT)));
  server.registerTool("archive_research_token", { description: "Archives a research queue entry without changing observation data.", inputSchema: { tokenAddress: address } }, async ({ tokenAddress }) => respond(service.archive(tokenAddress)));
}
function createService(): ResearchQueueService { const dbPath = getDatabasePath(); if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true }); return new ResearchQueueService(new ResearchQueueRepository(new Database(dbPath))); }
function respond(result: ReturnType<ResearchQueueService["add"]>) { if (!result.ok) { const response = { status: result.reason === "not_found" ? "not_found" as const : "error" as const, message: result.detail }; return { content: [{ type: "text" as const, text: JSON.stringify(response) }], structuredContent: response }; } const response = { status: "ok" as const, data: result.data }; return { content: [{ type: "text" as const, text: JSON.stringify(response) }], structuredContent: response }; }
