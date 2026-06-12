import type { GlobalCleanupExecution, GlobalCleanupPlan } from "./types.js";
export declare function buildGlobalCleanupPlan(includeHistory: boolean): GlobalCleanupPlan;
export declare function executeGlobalCleanup(plan: GlobalCleanupPlan, options: {
    dryRun: boolean;
    includeHistory: boolean;
}): GlobalCleanupExecution;
export declare function formatGlobalCleanupOutput(execution: GlobalCleanupExecution): string;
