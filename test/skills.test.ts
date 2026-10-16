import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildCommands, buildSkillPrompt, globToRegExp } from "../src/skills/commands.js"
import { discoverSkills, enabledCodexPlugins } from "../src/skills/discover.js"
import { parseSkill } from "../src/skills/frontmatter.js"

const skillMd = (name: string, description: string, body = "Do the thing.") => `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n${body}\n`

function put(root: string, rel: string, content: string) {
  const file = join(root, rel)
  mkdirSync(join(file, ".."), { recursive: true })
  writeFileSync(file, content)
  return file
}

describe("parseSkill", () => {
  it("reads plain, quoted, folded and literal values and strips the frontmatter", () => {
    const m = parseSkill('---\nname: "pdf-tool"\ndescription: >-\n  Work with\n  PDFs.\nother: x\n---\nBody here\n')
    expect(m).toEqual({ name: "pdf-tool", description: "Work with PDFs.", body: "Body here\n" })
    expect(parseSkill("---\ndescription: |\n  a\n  b\n---\nx").description).toBe("a\nb")
  })
  it("returns the whole text when there is no frontmatter", () => {
    expect(parseSkill("# Just text").body).toBe("# Just text")
  })
})

describe("enabledCodexPlugins", () => {
  it("lists only plugin tables with enabled = true", () => {
    const toml = '[plugins."a@m"]\n  enabled = true\n\n[plugins."b@m"]\n  enabled = false\n\n[plugins."c@m"]\n  enabled = true\n  [hooks.state."c@m:x"]\n    enabled = true\n'
    expect(enabledCodexPlugins(toml)).toEqual(["a@m", "c@m"])
  })
})

describe("discoverSkills", () => {
  function setup() {
    const home = mkdtempSync(join(tmpdir(), "skills-"))
    put(home, ".claude/skills/pdf/SKILL.md", skillMd("pdf", "Handle PDFs"))
    put(home, ".claude/skills/pdf/scripts/nested/SKILL.md", skillMd("inner", "must not be found"))
    put(home, ".claude/skills/.trash/old/SKILL.md", skillMd("old", "trashed"))
    put(home, ".claude/skills/synced/org_a/xlsx/SKILL.md", skillMd("xlsx", "Sheets"))
    put(home, ".claude/skills/synced/org_b/xlsx/SKILL.md", skillMd("xlsx", "Sheets"))
    put(home, ".claude/skills/synced/org_a/pdf2/SKILL.md", skillMd("pdf2", "v1"))
    put(home, ".claude/skills/synced/org_b/pdf2/SKILL.md", skillMd("pdf2", "v2"))
    const install = join(home, ".claude/plugins/cache/mp/sp/1.0.0")
    put(install, "skills/brainstorming/SKILL.md", skillMd("brainstorming", "Ideas"))
    put(home, ".claude/plugins/installed_plugins.json", JSON.stringify({ plugins: { "sp@mp": [{ installPath: install }], "off@mp": [{ installPath: join(home, "nowhere") }] } }))
    put(home, ".claude/settings.json", JSON.stringify({ enabledPlugins: { "sp@mp": true, "off@mp": false } }))
    put(home, ".codex/config.toml", '[plugins."viz@bundled"]\n  enabled = true\n[plugins."skipped@bundled"]\n  enabled = false\n')
    const oldV = join(home, ".codex/plugins/cache/bundled/viz/1")
    const newV = join(home, ".codex/plugins/cache/bundled/viz/2")
    put(oldV, "skills/old-skill/SKILL.md", skillMd("old-skill", "old"))
    put(newV, "skills/chart/SKILL.md", skillMd("chart", "Charts"))
    utimesSync(oldV, new Date(2020, 1, 1), new Date(2020, 1, 1))
    put(home, ".codex/plugins/cache/bundled/skipped/1/skills/nope/SKILL.md", skillMd("nope", "x"))
    put(home, ".gemini/antigravity/builtin/skills/agy-customizations/SKILL.md", skillMd("agy-customizations", "Customize"))
    put(home, ".agents/skills/shared/SKILL.md", skillMd("shared", "not ours"))
    return home
  }

  it("finds personal, synced and enabled plugin skills, but not nested, trashed, disabled, shared or identical duplicate ones", () => {
    const names = discoverSkills({ home: setup() }).map((s) => `${s.tool}:${s.plugin ?? "-"}:${s.name}`)
    expect(names).toEqual(["claude:-:pdf", "claude:-:pdf2", "claude:-:xlsx", "claude:-:pdf2", "claude:sp:brainstorming", "codex:viz:chart", "agy:-:agy-customizations"])
  })
  it("can switch a tool off and reads project skill folders", () => {
    const home = setup()
    const project = mkdtempSync(join(tmpdir(), "proj-"))
    put(project, ".claude/skills/local/SKILL.md", skillMd("local", "project skill"))
    const names = discoverSkills({ home, directory: project, tools: { codex: false, agy: false } }).map((s) => s.name)
    expect(names).toContain("local")
    expect(names).not.toContain("chart")
  })
})

describe("buildCommands", () => {
  const mk = (tool: any, name: string, plugin?: string) => ({ tool, name, plugin, description: `${name} desc`, file: `/x/${name}/SKILL.md`, dir: `/x/${name}` })

  it("prefixes with the tool and avoids doubling the prefix", () => {
    expect(buildCommands([mk("claude", "pdf"), mk("agy", "agy-customizations"), mk("codex", "Deep Research")]).map((c) => c.name)).toEqual(["claude-pdf", "agy-customizations", "codex-deep-research"])
  })
  it("resolves clashes: personal wins, plugin skill gets its plugin name, then a number", () => {
    const names = buildCommands([mk("claude", "docx"), mk("claude", "docx", "office"), mk("claude", "docx", "office"), mk("claude", "docx")]).map((c) => c.name)
    expect(names).toEqual(["claude-docx", "claude-office-docx", "claude-office-docx-2", "claude-docx-2"])
  })
  it("applies exclude globs and reserved names", () => {
    const names = buildCommands([mk("claude", "demo-skill"), mk("claude", "pdf"), mk("claude", "sources")], ["claude-demo-*"], ["claude-sources"]).map((c) => c.name)
    expect(names).toEqual(["claude-pdf", "claude-sources-2"])
  })
  it("shortens long descriptions and tags the source", () => {
    const [c] = buildCommands([{ ...mk("codex", "x", "viz"), description: "a ".repeat(200) }])
    expect(c!.description.startsWith("[codex/viz] ")).toBe(true)
    expect(c!.description.length).toBeLessThan(200)
  })
})

describe("globToRegExp", () => {
  it("matches whole names, case-insensitively, with * and ?", () => {
    expect(globToRegExp("claude-*").test("Claude-pdf")).toBe(true)
    expect(globToRegExp("claude-p?f").test("claude-pdf")).toBe(true)
    expect(globToRegExp("pdf").test("claude-pdf")).toBe(false)
  })
})

describe("buildSkillPrompt", () => {
  it("embeds the live skill body, directory and request, and survives unreadable files", () => {
    const home = mkdtempSync(join(tmpdir(), "skills-"))
    const file = put(home, "s/SKILL.md", skillMd("s", "d", "Use $ARGUMENTS and @file literally."))
    const [cmd] = buildCommands([{ tool: "claude", name: "s", description: "d", file, dir: join(home, "s") }])
    const text = buildSkillPrompt(cmd!, " summarise ")
    expect(text).toContain("/claude-s")
    expect(text).toContain("User request: summarise")
    expect(text).toContain("Use $ARGUMENTS and @file literally.")
    expect(text).not.toContain("name: s")
    expect(buildSkillPrompt({ ...cmd!, skill: { ...cmd!.skill, file: "/missing/SKILL.md" } }, "")).toContain("could not be read")
  })
})
