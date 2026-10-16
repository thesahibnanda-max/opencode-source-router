import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import type { Source, SourceSpec } from "../types.js"
import { TtlCache, clamp01 } from "../util.js"
import type { UsageWindow } from "./claude-usage.js"

interface CodexWindow {
  usedPercent?: number
}

/** Fraction left from a `account/rateLimits/read` result, or null when it has no windows. */
export function remainingFromCodex(result: any): number | null {
  if (result?.ordinaryUsageAllowed === false) return 0
  const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits
  const used = [limits?.primary, limits?.secondary]
    .map((w: CodexWindow | undefined) => w?.usedPercent)
    .filter((u): u is number => typeof u === "number")
  return used.length === 0 ? null : clamp01(1 - Math.max(...used) / 100)
}

const windowLabel = (mins: unknown) => (mins === 300 ? "5h" : mins === 10080 ? "7d" : typeof mins === "number" ? `${mins}m` : "window")

/** Windows and plan name from a `account/rateLimits/read` result, for display. */
export function codexWindows(result: any): { plan?: string; windows: UsageWindow[] } {
  const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits
  const windows: UsageWindow[] = []
  for (const w of [limits?.primary, limits?.secondary]) {
    if (typeof w?.usedPercent !== "number") continue
    windows.push({ label: windowLabel(w.windowDurationMins), usedPercent: w.usedPercent, resetsAt: typeof w.resetsAt === "number" ? w.resetsAt * 1000 : undefined })
  }
  return { plan: typeof limits?.planType === "string" ? limits.planType : undefined, windows }
}

/** Cached live Codex limits, shared by the router and `/usage`. Resolves null when Codex is missing or signed out. */
export class CodexUsageStore {
  private cache: TtlCache<any | null>

  constructor(ttlMs: number, private read: () => Promise<any> = () => readCodexLimits()) {
    this.cache = new TtlCache(ttlMs)
  }

  get(): Promise<any | null> {
    return this.cache.get(() => this.read().catch(() => null))
  }
}

/** Ask the local Codex CLI (app-server over stdio) for the live ChatGPT plan limits. */
export function readCodexLimits(bin = "codex", timeoutMs = 15_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] })
    const done = (fn: () => void) => {
      clearTimeout(timer)
      child.kill()
      fn()
    }
    const timer = setTimeout(() => done(() => reject(new Error("codex app-server timed out"))), timeoutMs)
    child.on("error", (e) => done(() => reject(e)))
    const lines = createInterface({ input: child.stdout })
    lines.on("line", (line) => {
      let m: any
      try {
        m = JSON.parse(line)
      } catch {
        return
      }
      if (m.id === 1) {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n")
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "account/rateLimits/read" }) + "\n")
      } else if (m.id === 2) {
        done(() => (m.error ? reject(new Error("codex rate limits unavailable")) : resolve(m.result)))
      }
    })
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "opencode-source-router", version: "0" }, capabilities: {} } }) + "\n",
    )
  })
}

export class OpenAISource implements Source {
  readonly model

  constructor(
    readonly spec: SourceSpec,
    private usage: CodexUsageStore,
  ) {
    this.model = { providerID: "openai", modelID: spec.modelID }
  }

  async remaining(): Promise<number | null> {
    const result = await this.usage.get()
    return result === null ? null : remainingFromCodex(result)
  }

  async prepare(): Promise<void> {}

  describe(): string {
    return "OpenAI / Codex"
  }
}
