export declare function scopedLogPath(scopeId: string, slug: string): string;
export declare function jobFilePath(scopeId: string, slug: string): string;
export declare function scopeJobsDir(scopeId: string): string;
export declare function scopeLocksDir(scopeId: string): string;
export declare function scopeRunsDir(scopeId: string): string;
export declare function scopeLogsDir(scopeId: string): string;
export declare function scopeDir(scopeId: string): string;
export declare function currentScopeId(): string;
export declare function normalizeWorkdirPath(workdir: string): string;
export declare function getLogPath(job: {
    scopeId?: string;
    workdir?: string;
    slug: string;
}): string;
