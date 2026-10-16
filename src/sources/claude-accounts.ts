import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { exec } from "../util.js"

export const DEFAULT_SERVICE = "Claude Code-credentials"

export interface ClaudeAccount {
  /** Keychain service name holding this login. */
  service: string
  /** Claude config dir (used for the credentials-file fallback off macOS). */
  configDir: string
  email?: string
  /** claude-swap slot number, when claude-swap manages this account. */
  num?: string
  alias?: string
}

export const hashedService = (configDir: string) =>
  `${DEFAULT_SERVICE}-${createHash("sha256").update(configDir.normalize("NFC")).digest("hex").slice(0, 8)}`

const slugifyEmail = (email: string) =>
  [...email.normalize("NFC")].map((ch) => (/^[A-Za-z0-9._-]$/.test(ch) ? ch : "_")).join("")

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return undefined
  }
}

function claudeJsonEmail(dir: string, home: string): string | undefined {
  const candidates = [join(dir, ".claude.json"), ...(dir === join(home, ".claude") ? [join(home, ".claude.json")] : [])]
  for (const c of candidates) {
    const email = readJson(c)?.oauthAccount?.emailAddress
    if (typeof email === "string") return email
  }
  return undefined
}

/**
 * Find Claude Code logins on this machine. claude-swap profiles come first (they carry slot numbers
 * and aliases); every other login is found from the plain Keychain entry and `~/.<dir>/.claude.json`.
 */
export function discoverAccounts(home = homedir(), env: NodeJS.ProcessEnv = process.env): ClaudeAccount[] {
  const found = new Map<string, ClaudeAccount>()

  const defaultDir = env.CLAUDE_CONFIG_DIR ?? join(home, ".claude")
  // The live login is whoever Claude Code says is signed in, not what claude-swap last recorded:
  // sequence.json's "active" slot can be out of date after a manual /login.
  const liveEmail = claudeJsonEmail(defaultDir, home)

  const swapRoot = join(home, ".claude-swap-backup")
  const seq = readJson(join(swapRoot, "sequence.json"))
  if (seq?.accounts && typeof seq.accounts === "object") {
    const entries = Object.entries<any>(seq.accounts).filter(([, a]) => typeof a?.email === "string")
    const liveNum = liveEmail ? entries.find(([, a]) => a.email.toLowerCase() === liveEmail.toLowerCase())?.[0] : String(seq.activeAccountNumber)
    for (const [num, a] of entries) {
      const active = liveNum === num && !env.CLAUDE_CONFIG_DIR
      const configDir = active ? defaultDir : join(swapRoot, "sessions", `${num}-${slugifyEmail(a.email)}`)
      const service = active ? DEFAULT_SERVICE : hashedService(configDir)
      // A session profile must really belong to this account, or its token would be labelled wrongly.
      const owner = active ? undefined : claudeJsonEmail(configDir, home)
      if (owner && owner.toLowerCase() !== a.email.toLowerCase()) continue
      found.set(service, { service, configDir, email: a.email, num, alias: typeof a.alias === "string" ? a.alias : undefined })
    }
  }

  const defaultService = env.CLAUDE_CONFIG_DIR ? hashedService(env.CLAUDE_CONFIG_DIR) : DEFAULT_SERVICE
  if (!found.has(defaultService)) {
    found.set(defaultService, { service: defaultService, configDir: defaultDir, email: liveEmail })
  }

  try {
    for (const entry of readdirSync(home, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(".") || entry.name === ".claude" || entry.name === ".claude-swap-backup") continue
      const dir = join(home, entry.name)
      if (!existsSync(join(dir, ".claude.json"))) continue
      const email = claudeJsonEmail(dir, home)
      const service = hashedService(dir)
      if (email && !found.has(service)) found.set(service, { service, configDir: dir, email })
    }
  } catch {
    // home not listable: keep what we have
  }
  return [...found.values()]
}

/** Match a reference from the config: slot number, alias, email, or the start of an email. */
export function resolveAccount(accounts: ClaudeAccount[], ref: string): ClaudeAccount | undefined {
  const r = ref.trim().toLowerCase()
  const eq = (a: ClaudeAccount) => a.num === r || a.alias?.toLowerCase() === r || a.email?.toLowerCase() === r
  const matches = accounts.filter(eq)
  if (matches.length === 1) return matches[0]
  const prefix = accounts.filter((a) => a.email?.toLowerCase().startsWith(r))
  return matches.length === 0 && prefix.length === 1 ? prefix[0] : undefined
}

export interface ClaudeCredentials {
  accessToken: string
  expiresAt: number
}

export async function readCredentials(account: ClaudeAccount): Promise<ClaudeCredentials | undefined> {
  try {
    const raw =
      process.platform === "darwin"
        ? await exec("security", ["find-generic-password", "-s", account.service, "-w"])
        : readFileSync(join(account.configDir, ".credentials.json"), "utf-8")
    const o = JSON.parse(raw)?.claudeAiOauth
    if (typeof o?.accessToken !== "string") return undefined
    return { accessToken: o.accessToken, expiresAt: typeof o.expiresAt === "number" ? o.expiresAt : 0 }
  } catch {
    return undefined
  }
}
