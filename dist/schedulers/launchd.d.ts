import type { Job } from "../types.js";
export declare function createLaunchdPlist(job: Job): string;
export declare function installLaunchdJob(job: Job): void;
export declare function uninstallLaunchdJob(job: Job): void;
