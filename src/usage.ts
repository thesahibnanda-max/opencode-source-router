import { type ClaudeAccount, discoverAccounts } from "./sources/claude-accounts.js"
import type { UsageWindow } from "./sources/claude-usage.js"
import { type AntigravityUsage, antigravityUsage, readAntigravityAccounts } from "./sources/google.js"
import { codexWindows } from "./sources/openai.js"
import type { UsageHub } from "./sources/index.js"

export interface UsageRow {
  name: string
  windows?: UsageWindow[]
  /** Extra text shown after the windows, e.g. a plan name or a warning. */
  note?: string
  error?: string
}

export interface UsageSection {
  title: string
  rows: UsageRow[]
  /** Shown when the section has no rows. */
  empty?: string
}

export interface UsageDeps {
  hub: UsageHub
  accounts?: () => ClaudeAccount[]
  antigravity?: () => AntigravityUsage[]
}

/** Quota of every signed-in login on this machine, whether or not it is in the `models` list. */
export async function collectUsage({ hub, accounts = () => discoverAccounts(), antigravity = () => antigravityUsage(readAntigravityAccounts()) }: UsageDeps): Promise<UsageSection[]> {
  const claudeRows = (
    await Promise.all(
      accounts().map(async (a): Promise<UsageRow | undefined> => {
        const result = await hub.claude.get(a)
        const name = `${a.email ?? a.service}${a.num ? ` (slot ${a.num})` : ""}`
        if ("error" in result && result.error === "not signed in") {
          // A claude-swap account that is not the live login: say how to bring it up instead of hiding it.
          return a.num ? { name, error: `no live login, it is only in claude-swap (run: cswap switch ${a.num}, or cswap run ${a.num})` } : undefined
        }
        return "windows" in result ? { name, windows: result.windows } : { name, error: result.error }
      }),
    )
  ).filter((r): r is UsageRow => r !== undefined)

  const codex = await hub.codex.get()
  const codexRow: UsageRow[] =
    codex === null
      ? []
      : (() => {
          const { plan, windows } = codexWindows(codex)
          return [{ name: "ChatGPT / Codex", windows, note: plan ? `${plan} plan` : undefined, error: windows.length === 0 ? "no limits reported" : undefined }]
        })()

  const agyRows: UsageRow[] = antigravity().map((a) => {
    const families = Object.entries(a.families)
    const flags = [a.enabled ? "" : "disabled", a.stale ? "cache is old" : ""].filter(Boolean).join(", ")
    return {
      name: a.email,
      note: flags || undefined,
      windows: families.flatMap(([family, ws]) => ws.map((w) => ({ ...w, label: `${family} ${w.label}` }))),
      error: families.length === 0 ? "no quota cached yet" : undefined,
    }
  })

  return [
    { title: "Claude", rows: claudeRows, empty: "no signed-in Claude accounts found" },
    { title: "OpenAI / Codex", rows: codexRow, empty: "Codex CLI not installed or not signed in" },
    { title: "Antigravity", rows: agyRows, empty: "no Antigravity accounts found" },
  ]
}

export function formatReset(resetsAt: number | undefined, now: number): string {
  if (resetsAt === undefined) return ""
  const mins = Math.round((resetsAt - now) / 60_000)
  if (mins <= 0) return "resets now"
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return `resets in ${d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}`
}

const formatWindow = (w: UsageWindow, now: number) => {
  const reset = formatReset(w.resetsAt, now)
  return `${w.label} ${Math.round(w.usedPercent)}% used${reset ? ` (${reset})` : ""}`
}

export function renderUsage(sections: UsageSection[], now = Date.now()): string {
  const lines = ["Usage of signed-in sources"]
  for (const s of sections) {
    lines.push("", s.title)
    if (s.rows.length === 0) lines.push(`  ${s.empty ?? "none"}`)
    for (const r of s.rows) {
      const body = r.windows && r.windows.length > 0 ? r.windows.map((w) => formatWindow(w, now)).join("; ") : (r.error ?? "")
      lines.push(`  ${r.name}: ${body}${r.note ? ` [${r.note}]` : ""}${r.windows?.length && r.error ? ` (${r.error})` : ""}`)
    }
  }
  return lines.join("\n")
}
