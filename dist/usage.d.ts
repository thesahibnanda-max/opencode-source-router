import { type ClaudeAccount } from "./sources/claude-accounts.js";
import type { UsageWindow } from "./sources/claude-usage.js";
import { type AntigravityUsage } from "./sources/google.js";
import type { UsageHub } from "./sources/index.js";
export interface UsageRow {
    name: string;
    windows?: UsageWindow[];
    /** Extra text shown after the windows, e.g. a plan name or a warning. */
    note?: string;
    error?: string;
}
export interface UsageSection {
    title: string;
    rows: UsageRow[];
    /** Shown when the section has no rows. */
    empty?: string;
}
export interface UsageDeps {
    hub: UsageHub;
    accounts?: () => ClaudeAccount[];
    antigravity?: () => AntigravityUsage[];
}
/** Quota of every signed-in login on this machine, whether or not it is in the `models` list. */
export declare function collectUsage({ hub, accounts, antigravity }: UsageDeps): Promise<UsageSection[]>;
export declare function formatReset(resetsAt: number | undefined, now: number): string;
export declare function renderUsage(sections: UsageSection[], now?: number): string;
