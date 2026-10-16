import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parseSkill } from "./frontmatter.js"

export type SkillTool = "claude" | "codex" | "agy"

export interface Skill {
  tool: SkillTool
  /** Skill name from its frontmatter, or the folder name. */
  name: string
  /** Plugin the skill comes from, when it is not a personal or project skill. */
  plugin?: string
  description: string
  /** Absolute path to SKILL.md. */
  file: string
  /** Folder holding SKILL.md (relative paths in the skill resolve against it). */
  dir: string
}

export interface DiscoverOptions {
  home?: string
  /** Project directory, for project-level skill folders. */
  directory?: string
  tools?: Partial<Record<SkillTool, boolean>>
}

const MAX_DEPTH = 4

/** Find skill folders under `root`: dirs containing SKILL.md, not descending into a skill. */
function findSkillFiles(root: string, allowDot: string[] = [], depth = 0): string[] {
  if (!existsSync(root)) return []
  const direct = join(root, "SKILL.md")
  if (depth > 0 && existsSync(direct)) return [direct]
  if (depth >= MAX_DEPTH) return []
  const found: string[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(root).sort()
  } catch {
    return []
  }
  for (const name of entries) {
    if ((name.startsWith(".") && !allowDot.includes(name)) || name === "node_modules") continue
    const child = join(root, name)
    try {
      if (statSync(child).isDirectory()) found.push(...findSkillFiles(child, allowDot, depth + 1))
    } catch {
      // unreadable or broken link: skip
    }
  }
  return found
}

function load(tool: SkillTool, file: string, plugin?: string): Skill | undefined {
  try {
    const dir = file.slice(0, -"/SKILL.md".length)
    const meta = parseSkill(readFileSync(file, "utf-8"))
    return { tool, name: meta.name?.trim() || dir.split("/").pop()!, plugin, description: meta.description?.trim() ?? "", file, dir }
  } catch {
    return undefined
  }
}

const scan = (tool: SkillTool, root: string, plugin?: string, allowDot: string[] = []) =>
  findSkillFiles(root, allowDot)
    .map((f) => load(tool, f, plugin))
    .filter((s): s is Skill => s !== undefined)

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return undefined
  }
}

function claudeSkills(home: string, directory?: string): Skill[] {
  const out = scan("claude", join(home, ".claude", "skills"))
  const installed = readJson(join(home, ".claude", "plugins", "installed_plugins.json"))?.plugins ?? {}
  const enabled = readJson(join(home, ".claude", "settings.json"))?.enabledPlugins ?? {}
  for (const [key, entries] of Object.entries<any>(installed).sort(([a], [b]) => a.localeCompare(b))) {
    if (enabled[key] !== true || !Array.isArray(entries)) continue
    const installPath = entries[entries.length - 1]?.installPath
    if (typeof installPath === "string") out.push(...scan("claude", join(installPath, "skills"), key.split("@")[0]))
  }
  if (directory) out.push(...scan("claude", join(directory, ".claude", "skills")))
  return out
}

/** `[plugins."name@marketplace"]` tables with `enabled = true` in Codex's config.toml. */
export function enabledCodexPlugins(toml: string): string[] {
  const enabled: string[] = []
  let current: string | undefined
  for (const line of toml.split("\n")) {
    const table = /^\s*\[plugins\."([^"]+)"\]\s*$/.exec(line)
    if (table) current = table[1]
    else if (/^\s*\[/.test(line)) current = undefined
    else if (current && /^\s*enabled\s*=\s*true\b/.test(line)) enabled.push(current)
  }
  return enabled
}

function newestVersionDir(pluginDir: string): string | undefined {
  try {
    return readdirSync(pluginDir)
      .map((v) => join(pluginDir, v))
      .filter((p) => statSync(p).isDirectory())
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  } catch {
    return undefined
  }
}

function codexSkills(home: string): Skill[] {
  const out = scan("codex", join(home, ".codex", "skills"), undefined, [".system"])
  let toml = ""
  try {
    toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8")
  } catch {
    return out
  }
  for (const key of enabledCodexPlugins(toml)) {
    const [plugin, marketplace] = key.split("@")
    if (!plugin || !marketplace) continue
    const version = newestVersionDir(join(home, ".codex", "plugins", "cache", marketplace, plugin))
    if (version) out.push(...scan("codex", join(version, "skills"), plugin))
  }
  return out
}

function agySkills(home: string, directory?: string): Skill[] {
  const root = join(home, ".gemini", "antigravity")
  const out = [...scan("agy", join(root, "skills")), ...scan("agy", join(root, "builtin", "skills"))]
  if (directory) out.push(...scan("agy", join(directory, ".agent", "skills")))
  return out
}

/** Drop later copies of a skill whose name and file contents are identical (e.g. the same skill synced for two accounts). */
function dropIdentical(skills: Skill[]): Skill[] {
  const seen = new Set<string>()
  return skills.filter((s) => {
    try {
      const key = `${s.tool}\0${s.name}\0${createHash("sha256").update(readFileSync(s.file)).digest("hex")}`
      if (seen.has(key)) return false
      seen.add(key)
    } catch {
      // unreadable: keep it, it will report its own error when run
    }
    return true
  })
}

/** Skills of Claude Code, Codex and Antigravity that are installed on this machine. */
export function discoverSkills(opts: DiscoverOptions = {}): Skill[] {
  const home = opts.home ?? homedir()
  const on = (t: SkillTool) => opts.tools?.[t] !== false
  return dropIdentical([
    ...(on("claude") ? claudeSkills(home, opts.directory) : []),
    ...(on("codex") ? codexSkills(home) : []),
    ...(on("agy") ? agySkills(home, opts.directory) : []),
  ])
}
