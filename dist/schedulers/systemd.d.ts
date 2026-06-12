import type { Job } from "../types.js";
export declare function createSystemdService(job: Job): string;
export declare function createSystemdTimer(job: Job): string;
export declare function installSystemdJob(job: Job): void;
export declare function uninstallSystemdJob(job: Job): void;
export declare function isSystemdUserAvailable(): boolean;
