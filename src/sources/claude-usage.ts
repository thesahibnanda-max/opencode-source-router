import { clamp01 } from "../util.js"

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const OAUTH_BETA = "oauth-2025-04-20"

export class UsageError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message)
  }
}

interface Window {
  utilization?: number
}

/** Fraction left on the tightest of the 5h and 7d windows. */
export function remainingFromUsage(data: { five_hour?: Window; seven_day?: Window }): number {
  const used = [data.five_hour?.utilization, data.seven_day?.utilization].filter((u): u is number => typeof u === "number")
  if (used.length === 0) throw new UsageError("usage response had no 5h/7d windows")
  return clamp01(1 - Math.max(...used) / 100)
}

export async function fetchClaudeRemaining(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(USAGE_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, "anthropic-beta": OAUTH_BETA, "User-Agent": "opencode-source-router" },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    const ra = Number(res.headers.get("retry-after"))
    throw new UsageError(`usage http ${res.status}`, res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined)
  }
  return remainingFromUsage((await res.json()) as any)
}
