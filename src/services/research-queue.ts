import { DEFAULT_RESEARCH_QUEUE_LIMIT, MAX_RESEARCH_QUEUE_LIMIT } from "../config/researchQueueLimits.js";
import { ResearchQueueRepository } from "../repositories/researchQueueRepository.js";
import type { ResearchPriority, ResearchQueueResult, WorkflowStatus } from "../types/research-queue.js";

export class ResearchQueueService {
  constructor(private readonly repository: ResearchQueueRepository) {}
  add(tokenAddress: string, status: WorkflowStatus = "DISCOVERED", priority: ResearchPriority = "MEDIUM", reason: string | null = null): ResearchQueueResult { try { return { ok: true, data: this.repository.add(tokenAddress, status, priority, reason) }; } catch { return { ok: false, reason: "storage_error", detail: "Research queue storage failed.", statusCode: null }; } }
  updateStatus(tokenAddress: string, status: WorkflowStatus): ResearchQueueResult { try { const data = this.repository.updateStatus(tokenAddress, status); return data ? { ok: true, data } : { ok: false, reason: "not_found", detail: "No research queue entry exists for this token.", statusCode: null }; } catch { return { ok: false, reason: "storage_error", detail: "Research queue storage failed.", statusCode: null }; } }
  updatePriority(tokenAddress: string, priority: ResearchPriority): ResearchQueueResult { try { const data = this.repository.updatePriority(tokenAddress, priority); return data ? { ok: true, data } : { ok: false, reason: "not_found", detail: "No research queue entry exists for this token.", statusCode: null }; } catch { return { ok: false, reason: "storage_error", detail: "Research queue storage failed.", statusCode: null }; } }
  list(status?: WorkflowStatus, priority?: ResearchPriority, limit?: number): ResearchQueueResult { try { const requested = typeof limit === "number" && Number.isFinite(limit) ? Math.trunc(limit) : DEFAULT_RESEARCH_QUEUE_LIMIT; return { ok: true, data: this.repository.list(status, priority, Math.min(Math.max(requested, 1), MAX_RESEARCH_QUEUE_LIMIT)) }; } catch { return { ok: false, reason: "storage_error", detail: "Research queue storage failed.", statusCode: null }; } }
  archive(tokenAddress: string): ResearchQueueResult { return this.updateStatus(tokenAddress, "ARCHIVED"); }
}
