import { ClaudeUsageStore } from "./claude-usage.js";
import { AnthropicApiSource } from "./anthropic-api.js";
import { discoverAccounts, resolveAccount } from "./claude-accounts.js";
import { ClaudeOAuthSource, ClaudeSwitcher } from "./claude-oauth.js";
import { GoogleSource } from "./google.js";
import { CodexUsageStore, OpenAISource } from "./openai.js";
export function createUsageHub(usageTtlSeconds) {
    return { claude: new ClaudeUsageStore(usageTtlSeconds * 1000), codex: new CodexUsageStore(usageTtlSeconds * 1000) };
}
export function buildSources(options, client, hub) {
    const accounts = options.sources.some((s) => s.kind === "claude-oauth") ? discoverAccounts() : [];
    const switcher = new ClaudeSwitcher(client);
    return options.sources.map((spec) => {
        switch (spec.kind) {
            case "claude-oauth":
                return new ClaudeOAuthSource(spec, resolveAccount(accounts, spec.account), switcher, hub.claude);
            case "claude-api":
                return new AnthropicApiSource(spec, options.auth["anthropic-api"]?.[spec.account]);
            case "openai":
                return new OpenAISource(spec, hub.codex);
            case "google":
                return new GoogleSource(spec);
        }
    });
}
