import type { Job } from "../types.js";
export declare function windowsTaskBaseName(job: Job): string;
export declare function windowsTaskName(baseName: string, index: number, total: number): string;
export declare function buildWindowsTaskCommand(job: Job): string;
export declare function cronToWindowsTaskDefinitions(job: Job): {
    name: string;
    args: string[];
}[];
export declare function installWindowsJob(job: Job): void;
export declare function uninstallWindowsJob(job: Job): void;
