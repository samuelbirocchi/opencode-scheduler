import type { LaunchdCalendar, WindowsTaskPlan } from "./types.js";
export declare function parseCronExpression(cron: string): {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
};
export declare function validateCronExpression(cron: string): void;
export declare function cronToLaunchdCalendars(cron: string): LaunchdCalendar[];
export declare function renderLaunchdCalendar(calendar: LaunchdCalendar): string;
export declare function cronToSystemdCalendars(cron: string): string[];
export declare function ensureWindowsRepresentable(cron: string): WindowsTaskPlan[];
export declare function describeCron(cron: string): string;
