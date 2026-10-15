import type { RouterOptions } from "../config.js"
import type { PluginClient, Source } from "../types.js"
import { AnthropicApiSource } from "./anthropic-api.js"
import { discoverAccounts, resolveAccount } from "./claude-accounts.js"
import { ClaudeOAuthSource, ClaudeSwitcher } from "./claude-oauth.js"
import { GoogleSource } from "./google.js"
import { OpenAISource } from "./openai.js"

export function buildSources(options: RouterOptions, client: PluginClient): Source[] {
  const accounts = options.sources.some((s) => s.kind === "claude-oauth") ? discoverAccounts() : []
  const switcher = new ClaudeSwitcher(client)
  return options.sources.map((spec): Source => {
    switch (spec.kind) {
      case "claude-oauth":
        return new ClaudeOAuthSource(spec, resolveAccount(accounts, spec.account!), switcher, options.usageTtlSeconds)
      case "claude-api":
        return new AnthropicApiSource(spec, options.auth["anthropic-api"]?.[spec.account!])
      case "openai":
        return new OpenAISource(spec, options.usageTtlSeconds)
      case "google":
        return new GoogleSource(spec)
    }
  })
}
