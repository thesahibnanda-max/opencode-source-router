import { type ClaudeAccount, type ClaudeCredentials } from "./claude-accounts.js";
export declare class UsageError extends Error {
    readonly status?: number | undefined;
    readonly retryAfterMs?: number | undefined;
    constructor(message: string, status?: number | undefined, retryAfterMs?: number | undefined);
}
/** One quota window, e.g. the 5 hour or 7 day limit. */
export interface UsageWindow {
    label: string;
    usedPercent: number;
    /** Epoch milliseconds. */
    resetsAt?: number;
}
interface RawWindow {
    utilization?: number;
    resets_at?: string;
}
export declare function windowsFromUsage(data: {
    five_hour?: RawWindow;
    seven_day?: RawWindow;
}): UsageWindow[];
/** Fraction left on the tightest window. */
export declare const remainingFromWindows: (windows: UsageWindow[]) => number;
export declare const remainingFromUsage: (data: Parameters<typeof windowsFromUsage>[0]) => number;
export declare function fetchClaudeWindows(accessToken: string, fetchImpl?: typeof fetch): Promise<UsageWindow[]>;
export type ClaudeUsageResult = {
    windows: UsageWindow[];
} | {
    error: string;
};
/**
 * Per-account usage, cached and backed off. Anthropic's usage endpoint allows only a few dozen requests
 * an hour, so the router and `/usage` share one store.
 */
export declare class ClaudeUsageStore {
    private ttlMs;
    private fetchWindows;
    private read;
    private now;
    private caches;
    private blockedUntil;
    constructor(ttlMs: number, fetchWindows?: (token: string) => Promise<UsageWindow[]>, read?: (a: ClaudeAccount) => Promise<ClaudeCredentials | undefined>, now?: () => number);
    get(account: ClaudeAccount): Promise<ClaudeUsageResult>;
}
export {};
