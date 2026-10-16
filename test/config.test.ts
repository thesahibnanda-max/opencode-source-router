import { describe, expect, it } from "vitest"
import { ConfigError, parseOptions, parseSourceKey } from "../src/config.js"

describe("parseSourceKey", () => {
  it("splits provider and account", () => {
    expect(parseSourceKey("anthropic@me@example.com")).toEqual({ kind: "claude-oauth", account: "me@example.com" })
    expect(parseSourceKey("openai")).toEqual({ kind: "openai", account: undefined })
  })
  it("rejects unknown providers and missing or extra accounts", () => {
    expect(() => parseSourceKey("mistral")).toThrow(ConfigError)
    expect(() => parseSourceKey("anthropic")).toThrow(/needs an account/)
    expect(() => parseSourceKey("openai@x")).toThrow(/does not take an account/)
  })
})

describe("parseOptions", () => {
  it("keeps config order and applies defaults", () => {
    const o = parseOptions({ models: { "anthropic@a": "m1", openai: "m2", google: "m3" } })
    expect(o.sources.map((s) => s.key)).toEqual(["anthropic@a", "openai", "google"])
    expect(o).toMatchObject({ cooldownMinutes: 15, switchMargin: 0.1, unknownScore: 0.5, usageTtlSeconds: 180 })
  })
  it("needs models or skills", () => {
    expect(parseOptions(undefined).sources).toEqual([])
    expect(() => parseOptions({ skills: false })).toThrow(/Nothing to do/)
    expect(() => parseOptions({ models: { openai: "" } })).toThrow(/non-empty/)
    expect(() => parseOptions("nope")).toThrow(ConfigError)
  })
  it("parses skills options", () => {
    expect(parseOptions({}).skills).toEqual({ claude: true, codex: true, agy: true, exclude: [] })
    expect(parseOptions({ skills: { codex: false, exclude: ["claude-load-*"] } }).skills).toEqual({ claude: true, codex: false, agy: true, exclude: ["claude-load-*"] })
    expect(parseOptions({ models: { openai: "m" }, skills: false }).skills.claude).toBe(false)
    expect(() => parseOptions({ skills: { codex: "no" } })).toThrow(/skills.codex/)
    expect(() => parseOptions({ skills: { exclude: "x" } })).toThrow(/skills.exclude/)
  })
  it("accepts env var names only under auth, never keys", () => {
    expect(parseOptions({ models: { "anthropic-api@k": "m" }, auth: { "anthropic-api": { k: "MY_KEY" } } }).auth).toEqual({ "anthropic-api": { k: "MY_KEY" } })
    expect(() => parseOptions({ models: { openai: "m" }, auth: { "anthropic-api": { k: "not a variable name" } } })).toThrow(/environment variable name/)
  })
  it("validates numeric tuning options", () => {
    expect(() => parseOptions({ models: { openai: "m" }, switchMargin: 2 })).toThrow(/switchMargin/)
  })
})
