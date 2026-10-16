import type { RouterOptions } from "../config.js";
import type { PluginClient, Source } from "../types.js";
import { ClaudeUsageStore } from "./claude-usage.js";
import { CodexUsageStore } from "./openai.js";
/** Caches shared by the router and `/usage`, so one lookup serves both. */
export interface UsageHub {
    claude: ClaudeUsageStore;
    codex: CodexUsageStore;
}
export declare function createUsageHub(usageTtlSeconds: number): UsageHub;
export declare function buildSources(options: RouterOptions, client: PluginClient, hub: UsageHub): Source[];
