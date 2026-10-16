import type { Source, SourceSpec } from "../types.js";
import type { UsageWindow } from "./claude-usage.js";
interface QuotaEntry {
    remainingFraction?: number;
    resetTime?: string;
}
interface AntigravityAccount {
    email?: string;
    enabled?: boolean;
    cachedQuota?: Record<string, QuotaEntry>;
    cachedQuotaUpdatedAt?: number;
}
export declare const antigravityFile: (home?: string, env?: NodeJS.ProcessEnv) => string;
/**
 * Best remaining fraction across enabled accounts for a model family ("gemini" or "claude"),
 * using the quota cache opencode-antigravity-auth keeps. A window whose reset time has passed
 * counts as full. Returns null when there is no fresh cache.
 */
export declare function remainingFromAccounts(accounts: AntigravityAccount[], family: string, now?: number): number | null;
export interface AntigravityUsage {
    email: string;
    enabled: boolean;
    /** The cache is old or missing, so the numbers may be out of date. */
    stale: boolean;
    /** Model family ("gemini", "claude") to its quota windows. */
    families: Record<string, UsageWindow[]>;
}
/** Every Antigravity account with its cached quota windows, for display. */
export declare function antigravityUsage(accounts: AntigravityAccount[], now?: number): AntigravityUsage[];
export declare function readAntigravityAccounts(file?: string): AntigravityAccount[];
export declare class GoogleSource implements Source {
    readonly spec: SourceSpec;
    private file;
    readonly model: {
        providerID: string;
        modelID: string;
    };
    constructor(spec: SourceSpec, file?: string);
    remaining(): Promise<number | null>;
    prepare(): Promise<void>;
    describe(): string;
}
export {};
