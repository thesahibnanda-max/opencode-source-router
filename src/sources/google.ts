import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { Source, SourceSpec } from "../types.js"
import { clamp01 } from "../util.js"

const STALE_MS = 6 * 3600_000

interface QuotaEntry {
  remainingFraction?: number
  resetTime?: string
}
interface AntigravityAccount {
  enabled?: boolean
  cachedQuota?: Record<string, QuotaEntry>
  cachedQuotaUpdatedAt?: number
}

export const antigravityFile = (home = homedir(), env: NodeJS.ProcessEnv = process.env) =>
  join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode", "antigravity-accounts.json")

/**
 * Best remaining fraction across enabled accounts for a model family ("gemini" or "claude"),
 * using the quota cache opencode-antigravity-auth keeps. A window whose reset time has passed
 * counts as full. Returns null when there is no fresh cache.
 */
export function remainingFromAccounts(accounts: AntigravityAccount[], family: string, now = Date.now()): number | null {
  const per: number[] = []
  for (const a of accounts) {
    if (a.enabled === false || !a.cachedQuota) continue
    if (!a.cachedQuotaUpdatedAt || now - a.cachedQuotaUpdatedAt > STALE_MS) continue
    const fractions = [`${family}-weekly`, `${family}-nonweekly`]
      .map((k) => a.cachedQuota![k])
      .filter((q): q is QuotaEntry => typeof q?.remainingFraction === "number")
      .map((q) => (q.resetTime && Date.parse(q.resetTime) <= now ? 1 : q.remainingFraction!))
    if (fractions.length > 0) per.push(Math.min(...fractions))
  }
  return per.length === 0 ? null : clamp01(Math.max(...per))
}

export class GoogleSource implements Source {
  readonly model

  constructor(
    readonly spec: SourceSpec,
    private file: string = antigravityFile(),
  ) {
    this.model = { providerID: "google", modelID: spec.modelID }
  }

  remaining(): Promise<number | null> {
    try {
      const data = JSON.parse(readFileSync(this.file, "utf-8"))
      const family = /claude/i.test(this.spec.modelID) ? "claude" : "gemini"
      return Promise.resolve(Array.isArray(data?.accounts) ? remainingFromAccounts(data.accounts, family) : null)
    } catch {
      return Promise.resolve(null)
    }
  }

  async prepare(): Promise<void> {}

  describe(): string {
    return "Antigravity"
  }
}
