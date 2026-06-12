import type { Job, JobRunSpec } from "./types.js";
export declare function ensureScopeStorage(scopeId: string): void;
export declare function loadScopedJob(scopeId: string, slug: string): Job | null;
export declare function loadAllScopedJobs(scopeId: string): Job[];
export declare function listScopeIds(): string[];
export declare function loadAllJobsAcrossScopes(): Job[];
export declare function loadLegacyJob(slug: string): Job | null;
export declare function loadAllLegacyJobs(): Job[];
export declare function saveJob(job: Job): void;
export declare function deleteJobFile(job: Job): void;
export declare function normalizeJob(raw: unknown): Job | null;
export declare function normalizeJobRun(raw: unknown): JobRunSpec | undefined;
export declare function normalizeJobInvocation(raw: unknown): {
    command: string;
    args: string[];
} | undefined;
export declare function normalizeRunFormat(value: unknown): "default" | "json" | undefined;
export declare function parseRunFormatInput(value: unknown): "default" | "json" | undefined;
export declare function sanitizeJob(job: Job): Job;
export declare function normalizeRunSpec(run: JobRunSpec): JobRunSpec;
export declare function validateRunSpec(run: JobRunSpec): void;
export declare function normalizeAttachUrl(attachUrl?: string): string | undefined;
export declare function getJobRun(job: Job): JobRunSpec;
export declare function findJobByName(name: string, options?: {
    scopeId?: string;
    allScopes?: boolean;
    includeLegacy?: boolean;
}): Job | null;
export declare function updateJobRecord(job: Job, updates: Partial<Job>): Job;
