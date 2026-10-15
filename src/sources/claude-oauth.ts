import type { PluginClient, Source, SourceSpec } from "../types.js"
import { TtlCache } from "../util.js"
import { type ClaudeAccount, readCredentials } from "./claude-accounts.js"
import { UsageError, fetchClaudeRemaining } from "./claude-usage.js"

const SWITCH_LABEL = "Switch Claude Code account"

/**
 * Moves the running `opencode-claude-auth` plugin to another Claude login through its own
 * "Switch Claude Code account" auth method. It keeps its active account in memory per process.
 */
export class ClaudeSwitcher {
  private active: string | null = null
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private client: PluginClient) {}

  switchTo(service: string): Promise<void> {
    const run = async () => {
      if (this.active === service) return
      const methods = (await this.client.provider.auth()).data?.anthropic ?? []
      const method = methods.findIndex((m) => m.type === "oauth" && m.label === SWITCH_LABEL)
      if (method < 0) throw new Error('opencode-claude-auth is not loaded (no "Switch Claude Code account" method)')
      const auth = await this.client.provider.oauth.authorize({ path: { id: "anthropic" }, body: { method, inputs: { account: service } } })
      if (auth.error) throw new Error("could not switch Claude account (authorize failed)")
      const done = await this.client.provider.oauth.callback({ path: { id: "anthropic" }, body: { method } })
      if (done.error) throw new Error("could not switch Claude account (callback failed)")
      this.active = service
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => undefined)
    return next
  }
}

export class ClaudeOAuthSource implements Source {
  readonly model
  private usage: TtlCache<number | null>
  private blockedUntil = 0

  constructor(
    readonly spec: SourceSpec,
    private account: ClaudeAccount | undefined,
    private switcher: ClaudeSwitcher,
    usageTtlSeconds: number,
  ) {
    this.model = { providerID: "anthropic", modelID: spec.modelID }
    this.usage = new TtlCache(usageTtlSeconds * 1000)
  }

  remaining(): Promise<number | null> {
    if (!this.account) return Promise.resolve(null)
    const account = this.account
    return this.usage.get(async () => {
      if (Date.now() < this.blockedUntil) return null
      const creds = await readCredentials(account)
      if (!creds || (creds.expiresAt && creds.expiresAt < Date.now())) return null
      try {
        return await fetchClaudeRemaining(creds.accessToken)
      } catch (err) {
        // The usage endpoint has a small request budget; back off when it pushes back.
        if (err instanceof UsageError && err.status === 429) this.blockedUntil = Date.now() + (err.retryAfterMs ?? 10 * 60_000)
        return null
      }
    })
  }

  async prepare(): Promise<void> {
    if (!this.account) throw new Error(`no Claude login matches "${this.spec.account}"`)
    if (!(await readCredentials(this.account))) throw new Error(`Claude login "${this.spec.account}" has no stored credentials (run claude once with it)`)
    await this.switcher.switchTo(this.account.service)
  }

  describe(): string {
    return this.account ? `Claude OAuth ${this.account.email ?? this.account.service}` : `Claude OAuth "${this.spec.account}" (login not found)`
  }
}
