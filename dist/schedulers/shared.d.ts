export declare function isCommandAvailable(command: string): boolean;
export declare function findOpencode(): string;
export declare function getEnhancedPath(): string;
export declare function buildRunEnvironment(): NodeJS.ProcessEnv;
export declare function getOpencodeVersion(opencodePath: string): string | null;
export declare function loadSchedulerConfig(): {
    env?: {
        preserveOpencodeEnv?: boolean;
        preserve?: string[];
        set?: Record<string, string>;
    };
};
