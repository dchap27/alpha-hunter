export type WorkflowStatus = "DISCOVERED" | "SCREENED" | "INVESTIGATED" | "WATCHING" | "ARCHIVED";
export type ResearchPriority = "LOW" | "MEDIUM" | "HIGH";
export interface ResearchQueueEntry extends Record<string, unknown> { tokenAddress: string; status: WorkflowStatus; priority: ResearchPriority; reason: string | null; createdAt: number; updatedAt: number; }
export type ResearchQueueResult = { ok: true; data: ResearchQueueEntry | ResearchQueueEntry[] } | { ok: false; reason: "not_found" | "storage_error"; detail: string; statusCode: number | null };
