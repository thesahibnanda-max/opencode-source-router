import type { PluginClient, Source, SourceSpec } from "../types.js";
import { type ClaudeAccount } from "./claude-accounts.js";
import { type ClaudeUsageStore } from "./claude-usage.js";
/**
 * Moves the running `opencode-claude-auth` plugin to another Claude login through its own
 * "Switch Claude Code account" auth method. It keeps its active account in memory per process.
 */
export declare class ClaudeSwitcher {
    private client;
    private active;
    private chain;
    constructor(client: PluginClient);
    /**
     * Method indexes to try. Listing the methods is the precise way, but opencode answers that call with
     * an error while two or more Claude logins exist (the switch menu has an option without a hint), so
     * fall back to the first few indexes: the switch method is the plugin's only one and comes first.
     */
    private candidateMethods;
    switchTo(service: string): Promise<void>;
}
export declare class ClaudeOAuthSource implements Source {
    readonly spec: SourceSpec;
    private account;
    private switcher;
    private usage;
    readonly model: {
        providerID: string;
        modelID: string;
    };
    constructor(spec: SourceSpec, account: ClaudeAccount | undefined, switcher: ClaudeSwitcher, usage: ClaudeUsageStore);
    remaining(): Promise<number | null>;
    prepare(): Promise<void>;
    describe(): string;
}
