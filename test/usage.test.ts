import { describe, expect, it, vi } from "vitest"
import type { ClaudeAccount } from "../src/sources/claude-accounts.js"
import { ClaudeUsageStore, UsageError, windowsFromUsage } from "../src/sources/claude-usage.js"
import { antigravityUsage } from "../src/sources/google.js"
import { CodexUsageStore, codexWindows } from "../src/sources/openai.js"
import { collectUsage, formatReset, renderUsage } from "../src/usage.js"

const now = Date.parse("2026-10-16T00:00:00Z")
const account = (service: string, extra: Partial<ClaudeAccount> = {}): ClaudeAccount => ({ service, configDir: "/x", email: `${service}@example.com`, ...extra })

describe("windowsFromUsage", () => {
  it("reads 5h and 7d with reset times", () => {
    const w = windowsFromUsage({ five_hour: { utilization: 9, resets_at: "2026-10-16T05:00:00Z" }, seven_day: { utilization: 69 } })
    expect(w).toEqual([{ label: "5h", usedPercent: 9, resetsAt: Date.parse("2026-10-16T05:00:00Z") }, { label: "7d", usedPercent: 69, resetsAt: undefined }])
  })
})

describe("ClaudeUsageStore", () => {
  const creds = { accessToken: "t", expiresAt: now + 3600_000 }
  it("caches per account and shares one in-flight call", async () => {
    const fetchWindows = vi.fn(async () => [{ label: "5h", usedPercent: 10 }])
    const store = new ClaudeUsageStore(60_000, fetchWindows, async () => creds, () => now)
    const a = account("a")
    await Promise.all([store.get(a), store.get(a)])
    await store.get(a)
    expect(fetchWindows).toHaveBeenCalledTimes(1)
    await store.get(account("b"))
    expect(fetchWindows).toHaveBeenCalledTimes(2)
  })
  it("reports missing and expired logins without calling the API", async () => {
    const fetchWindows = vi.fn()
    expect(await new ClaudeUsageStore(1, fetchWindows, async () => undefined, () => now).get(account("a"))).toEqual({ error: "not signed in" })
    const expired = await new ClaudeUsageStore(1, fetchWindows, async () => ({ accessToken: "t", expiresAt: now - 1 }), () => now).get(account("a"))
    expect(expired).toMatchObject({ error: expect.stringContaining("expired") })
    expect(fetchWindows).not.toHaveBeenCalled()
  })
  it("backs off after a 429", async () => {
    const fetchWindows = vi.fn(async () => {
      throw new UsageError("usage http 429", 429, 600_000)
    })
    const store = new ClaudeUsageStore(0, fetchWindows, async () => creds, () => now)
    expect(await store.get(account("a"))).toEqual({ error: "unavailable (HTTP 429)" })
    expect(await store.get(account("a"))).toMatchObject({ error: expect.stringContaining("rate-limited") })
    expect(fetchWindows).toHaveBeenCalledTimes(1)
  })
})

describe("codexWindows", () => {
  it("labels windows by length and converts reset seconds", () => {
    const r = codexWindows({ rateLimits: { planType: "plus", primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1000 }, secondary: { usedPercent: 15, windowDurationMins: 10080 } } })
    expect(r).toEqual({ plan: "plus", windows: [{ label: "5h", usedPercent: 0, resetsAt: 1_000_000 }, { label: "7d", usedPercent: 15, resetsAt: undefined }] })
  })
  it("store resolves null when codex fails", async () => {
    expect(await new CodexUsageStore(1000, async () => Promise.reject(new Error("no codex"))).get()).toBeNull()
  })
})

describe("antigravityUsage", () => {
  it("converts quota cache to used percentages and flags stale or disabled accounts", () => {
    const [a, b] = antigravityUsage(
      [
        { email: "a@example.com", enabled: true, cachedQuotaUpdatedAt: now - 1000, cachedQuota: { "gemini-weekly": { remainingFraction: 0.25, resetTime: "2026-10-20T00:00:00Z" }, "gemini-nonweekly": { remainingFraction: 0.9, resetTime: "2026-10-15T00:00:00Z" } } },
        { email: "b@example.com", enabled: false, cachedQuota: {} },
      ],
      now,
    )
    expect(a!.stale).toBe(false)
    expect(a!.families.gemini).toEqual([{ label: "weekly", usedPercent: 75, resetsAt: Date.parse("2026-10-20T00:00:00Z") }, { label: "non-weekly", usedPercent: 0, resetsAt: undefined }])
    expect(b).toMatchObject({ enabled: false, stale: true, families: {} })
  })
})

describe("formatReset", () => {
  it("formats days, hours and minutes", () => {
    expect(formatReset(now + 4 * 86_400_000 + 20 * 3600_000, now)).toBe("resets in 4d 20h")
    expect(formatReset(now + 2 * 3600_000 + 5 * 60_000, now)).toBe("resets in 2h 5m")
    expect(formatReset(now + 7 * 60_000, now)).toBe("resets in 7m")
    expect(formatReset(now - 1, now)).toBe("resets now")
    expect(formatReset(undefined, now)).toBe("")
  })
})

describe("collectUsage + renderUsage", () => {
  const hub = {
    claude: { get: async (a: ClaudeAccount) => (a.service === "out" || a.service === "swapped" ? { error: "not signed in" } : a.service === "bad" ? { error: "token expired (use Claude once to refresh it)" } : { windows: [{ label: "5h", usedPercent: 9, resetsAt: now + 3600_000 }, { label: "7d", usedPercent: 69 }] }) },
    codex: { get: async () => ({ rateLimits: { planType: "plus", primary: { usedPercent: 0, windowDurationMins: 300 }, secondary: { usedPercent: 15, windowDurationMins: 10080 } } }) },
  } as any

  it("lists every signed-in login, hides unknown signed-out ones, flags cswap-only accounts, and shows errors per account", async () => {
    const out = renderUsage(
      await collectUsage({ hub, accounts: () => [account("ok", { num: "2" }), account("out"), account("bad"), account("swapped", { num: "1" })], antigravity: () => antigravityUsage([{ email: "g@example.com", enabled: true, cachedQuotaUpdatedAt: now, cachedQuota: { "gemini-weekly": { remainingFraction: 0.5 } } }], now) }),
      now,
    )
    expect(out).toContain("ok@example.com (slot 2): 5h 9% used (resets in 1h 0m); 7d 69% used")
    expect(out).toContain("bad@example.com: token expired")
    expect(out).not.toContain("out@example.com")
    expect(out).toContain("swapped@example.com (slot 1): no live login, it is only in claude-swap (run: cswap switch 1, or cswap run 1)")
    expect(out).toContain("ChatGPT / Codex: 5h 0% used; 7d 15% used [plus plan]")
    expect(out).toContain("g@example.com: gemini weekly 50% used")
  })

  it("explains empty sections", async () => {
    const empty = { claude: { get: async () => ({ error: "not signed in" }) }, codex: { get: async () => null } } as any
    const out = renderUsage(await collectUsage({ hub: empty, accounts: () => [account("out")], antigravity: () => [] }), now)
    expect(out).toContain("no signed-in Claude accounts found")
    expect(out).toContain("Codex CLI not installed or not signed in")
    expect(out).toContain("no Antigravity accounts found")
  })
})
