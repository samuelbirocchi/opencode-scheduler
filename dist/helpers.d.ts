import type { Job } from "./types.js";
type OutputFormat = "text" | "json";
export declare function formatJobDetails(job: Job): string;
export declare function getJobLogs(job: Job, options?: {
    tailLines?: number;
    maxChars?: number;
}): string | null;
export declare function okResult<T>(format: OutputFormat, output: string, data?: T): string;
export declare function errorResult<T>(format: OutputFormat, output: string, data?: T): string;
export declare function normalizeFormat(format?: string): OutputFormat;
export {};
