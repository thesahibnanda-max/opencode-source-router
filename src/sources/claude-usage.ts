import { clamp01, TtlCache } from "../util.js"
import { type ClaudeAccount, type ClaudeCredentials, readCredentials } from "./claude-accounts.js"

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const OAUTH_BETA = "oauth-2025-04-20"

export class UsageError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message)
  }
}

/** One quota window, e.g. the 5 hour or 7 day limit. */
export interface UsageWindow {
  label: string
  usedPercent: number
  /** Epoch milliseconds. */
  resetsAt?: number
}

interface RawWindow {
  utilization?: number
  resets_at?: string
}

export function windowsFromUsage(data: { five_hour?: RawWindow; seven_day?: RawWindow }): UsageWindow[] {
  const out: UsageWindow[] = []
  for (const [label, w] of [["5h", data.five_hour], ["7d", data.seven_day]] as const) {
    if (typeof w?.utilization !== "number") continue
    const resetsAt = w.resets_at ? Date.parse(w.resets_at) : NaN
    out.push({ label, usedPercent: w.utilization, resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt })
  }
  if (out.length === 0) throw new UsageError("usage response had no 5h/7d windows")
  return out
}

/** Fraction left on the tightest window. */
export const remainingFromWindows = (windows: UsageWindow[]): number => clamp01(1 - Math.max(...windows.map((w) => w.usedPercent)) / 100)

export const remainingFromUsage = (data: Parameters<typeof windowsFromUsage>[0]): number => remainingFromWindows(windowsFromUsage(data))

export async function fetchClaudeWindows(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<UsageWindow[]> {
  const res = await fetchImpl(USAGE_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "anthropic-beta": OAUTH_BETA, "User-Agent": "opencode-source-router" },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"))
    throw new UsageError(`usage http ${res.status}`, res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined)
  }
  return windowsFromUsage((await res.json()) as any)
}

export type ClaudeUsageResult = { windows: UsageWindow[] } | { error: string }

/**
 * Per-account usage, cached and backed off. Anthropic's usage endpoint allows only a few dozen requests
 * an hour, so the router and `/usage` share one store.
 */
export class ClaudeUsageStore {
  private caches = new Map<string, TtlCache<ClaudeUsageResult>>()
  private blockedUntil = new Map<string, number>()

  constructor(
    private ttlMs: number,
    private fetchWindows: (token: string) => Promise<UsageWindow[]> = fetchClaudeWindows,
    private read: (a: ClaudeAccount) => Promise<ClaudeCredentials | undefined> = readCredentials,
    private now: () => number = Date.now,
  ) {}

  get(account: ClaudeAccount): Promise<ClaudeUsageResult> {
    let cache = this.caches.get(account.service)
    if (!cache) this.caches.set(account.service, (cache = new TtlCache(this.ttlMs)))
    return cache.get(async (): Promise<ClaudeUsageResult> => {
      const creds = await this.read(account)
      if (!creds) return { error: "not signed in" }
      if (creds.expiresAt && creds.expiresAt < this.now()) return { error: "token expired (use Claude once to refresh it)" }
      if (this.now() < (this.blockedUntil.get(account.service) ?? 0)) return { error: "rate-limited by Anthropic, try again later" }
      try {
        return { windows: await this.fetchWindows(creds.accessToken) }
      } catch (err) {
        if (err instanceof UsageError && err.status === 429) this.blockedUntil.set(account.service, this.now() + (err.retryAfterMs ?? 10 * 60_000))
        return { error: err instanceof UsageError && err.status ? `unavailable (HTTP ${err.status})` : "unavailable" }
      }
    })
  }
}
