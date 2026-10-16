import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_SERVICE, discoverAccounts, hashedService, resolveAccount } from "../src/sources/claude-accounts.js"
import { remainingFromUsage } from "../src/sources/claude-usage.js"
import { remainingFromAccounts } from "../src/sources/google.js"
import { remainingFromCodex } from "../src/sources/openai.js"

describe("claude usage", () => {
  it("uses the tightest window", () => {
    expect(remainingFromUsage({ five_hour: { utilization: 26 }, seven_day: { utilization: 60 } })).toBeCloseTo(0.4)
  })
  it("rejects a response without windows", () => {
    expect(() => remainingFromUsage({})).toThrow()
  })
})

describe("codex limits", () => {
  const result = { ordinaryUsageAllowed: true, rateLimitsByLimitId: { codex: { primary: { usedPercent: 0 }, secondary: { usedPercent: 15 } } } }
  it("uses the tightest window", () => {
    expect(remainingFromCodex(result)).toBeCloseTo(0.85)
  })
  it("is zero when usage is not allowed and null when there is no data", () => {
    expect(remainingFromCodex({ ...result, ordinaryUsageAllowed: false })).toBe(0)
    expect(remainingFromCodex({})).toBeNull()
  })
})

describe("antigravity quota", () => {
  const now = Date.parse("2026-10-15T00:00:00Z")
  const acct = (gemini: number, extra: object = {}) => ({
    enabled: true,
    cachedQuotaUpdatedAt: now - 1000,
    cachedQuota: { "gemini-weekly": { remainingFraction: gemini, resetTime: "2026-10-20T00:00:00Z" }, "gemini-nonweekly": { remainingFraction: 0.9, resetTime: "2026-10-15T05:00:00Z" } },
    ...extra,
  })
  it("takes the tightest family window, best across accounts", () => {
    expect(remainingFromAccounts([acct(0.3), acct(0.6)], "gemini", now)).toBeCloseTo(0.6)
  })
  it("treats a window past its reset time as full", () => {
    const a = acct(0.3)
    a.cachedQuota["gemini-weekly"].resetTime = "2026-10-14T00:00:00Z"
    expect(remainingFromAccounts([a], "gemini", now)).toBeCloseTo(0.9)
  })
  it("ignores disabled accounts and stale caches", () => {
    expect(remainingFromAccounts([acct(0.5, { enabled: false })], "gemini", now)).toBeNull()
    expect(remainingFromAccounts([acct(0.5, { cachedQuotaUpdatedAt: now - 7 * 3600_000 })], "gemini", now)).toBeNull()
  })
})

describe("claude accounts", () => {
  function home() {
    const h = mkdtempSync(join(tmpdir(), "router-"))
    mkdirSync(join(h, ".claude-swap-backup"), { recursive: true })
    writeFileSync(
      join(h, ".claude-swap-backup", "sequence.json"),
      JSON.stringify({ activeAccountNumber: 1, accounts: { "1": { email: "work@example.com" }, "2": { email: "me+x@example.com", alias: "home" } } }),
    )
    return h
  }
  it("maps the active swap account to the plain entry and others to their session profile", () => {
    const h = home()
    const accounts = discoverAccounts(h, {})
    expect(accounts.find((a) => a.num === "1")?.service).toBe(DEFAULT_SERVICE)
    expect(accounts.find((a) => a.num === "2")?.service).toBe(hashedService(join(h, ".claude-swap-backup", "sessions", "2-me_x_example.com")))
  })
  it("follows the account Claude Code is really signed in as, even when sequence.json is stale", () => {
    const h = home() // sequence.json says slot 1 is active
    writeFileSync(join(h, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "ME+X@example.com" } }))
    const accounts = discoverAccounts(h, {})
    expect(accounts.find((a) => a.num === "2")?.service).toBe(DEFAULT_SERVICE)
    expect(accounts.find((a) => a.num === "1")?.service).toBe(hashedService(join(h, ".claude-swap-backup", "sessions", "1-work_example.com")))
  })
  it("ignores a session profile that is signed in as a different account", () => {
    const h = home()
    const dir = join(h, ".claude-swap-backup", "sessions", "2-me_x_example.com")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "someone-else@example.com" } }))
    expect(discoverAccounts(h, {}).find((a) => a.num === "2")).toBeUndefined()
  })
  it("resolves by slot, alias, email and email prefix", () => {
    const accounts = discoverAccounts(home(), {})
    for (const ref of ["2", "home", "ME+X@example.com", "me+x"]) expect(resolveAccount(accounts, ref)?.num).toBe("2")
    expect(resolveAccount(accounts, "nobody")).toBeUndefined()
  })
  it("finds non-swap logins from dot directories", () => {
    const h = mkdtempSync(join(tmpdir(), "router-"))
    mkdirSync(join(h, ".claude-b"), { recursive: true })
    writeFileSync(join(h, ".claude-b", ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "b@example.com" } }))
    const accounts = discoverAccounts(h, {})
    expect(accounts.find((a) => a.email === "b@example.com")?.service).toBe(hashedService(join(h, ".claude-b")))
  })
})
