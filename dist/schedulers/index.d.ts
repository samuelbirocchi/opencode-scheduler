import type { Job, SchedulerBackend } from "../types.js";
export declare function resolveSchedulerBackend(): SchedulerBackend;
export declare function installJob(job: Job): SchedulerBackend;
export declare function uninstallJob(job: Job): void;
