import type { Source, SourceSpec } from "../types.js";
import type { UsageWindow } from "./claude-usage.js";
/** Fraction left from a `account/rateLimits/read` result, or null when it has no windows. */
export declare function remainingFromCodex(result: any): number | null;
/** Windows and plan name from a `account/rateLimits/read` result, for display. */
export declare function codexWindows(result: any): {
    plan?: string;
    windows: UsageWindow[];
};
/** Cached live Codex limits, shared by the router and `/usage`. Resolves null when Codex is missing or signed out. */
export declare class CodexUsageStore {
    private read;
    private cache;
    constructor(ttlMs: number, read?: () => Promise<any>);
    get(): Promise<any | null>;
}
/** Ask the local Codex CLI (app-server over stdio) for the live ChatGPT plan limits. */
export declare function readCodexLimits(bin?: string, timeoutMs?: number): Promise<any>;
export declare class OpenAISource implements Source {
    readonly spec: SourceSpec;
    private usage;
    readonly model: {
        providerID: string;
        modelID: string;
    };
    constructor(spec: SourceSpec, usage: CodexUsageStore);
    remaining(): Promise<number | null>;
    prepare(): Promise<void>;
    describe(): string;
}
