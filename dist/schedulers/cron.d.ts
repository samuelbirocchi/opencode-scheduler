import type { Job } from "../types.js";
export declare function isCronAvailable(): boolean;
export declare function cronBlockId(job: Job): string;
export declare function cronLegacyBlockId(job: Job): string;
export declare function cronBlockStart(id: string): string;
export declare function cronBlockEnd(id: string): string;
export declare function shellEscapeDoubleQuoted(value: string): string;
export declare function readUserCrontab(): string;
export declare function writeUserCrontab(content: string): void;
export declare function stripManagedCronBlocks(content: string, blockIds: Set<string>): {
    content: string;
    removed: number;
};
export declare function createCronEntry(job: Job): string;
export declare function installCronJob(job: Job): void;
export declare function uninstallCronJob(job: Job): void;
