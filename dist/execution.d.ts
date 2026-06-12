import type { Job } from "./types.js";
export declare function buildOpencodeArgs(job: Job): {
    command: string;
    args: string[];
};
export declare function runJobNow(job: Job): {
    startedAt: string;
    logPath: string;
    pid: number | undefined;
    job: Job;
};
