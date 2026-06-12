export declare function ensureDir(dir: string): void;
export declare function slugify(name: string): string;
export declare function uniquePaths(paths: string[]): string[];
export declare function isRecord(value: unknown): value is Record<string, unknown>;
export declare function listDirectoryFiles(dir: string, options?: {
    prefix?: string;
    suffix?: string;
}): string[];
export declare function listDirectoryNames(dir: string): string[];
export declare function deriveScopeId(workdir: string): string;
