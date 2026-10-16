export interface SkillMeta {
  name?: string
  description?: string
  /** Skill instructions without the frontmatter block. */
  body: string
}

const BLOCK_MARKERS = new Set([">", ">-", ">+", "|", "|-", "|+"])

function unquote(v: string): string {
  const t = v.trim()
  return t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) ? t.slice(1, -1) : t
}

/** Reads `name` and `description` from a SKILL.md frontmatter block (plain, quoted, folded `>` and literal `|` values). */
export function parseSkill(text: string): SkillMeta {
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n")
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src)
  if (!m) return { body: src }
  const lines = m[1]!.split("\n")
  const meta: Record<string, string> = {}
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]!)
    if (!kv) continue
    const [, key, value] = kv as unknown as [string, string, string]
    if (BLOCK_MARKERS.has(value.trim())) {
      const block: string[] = []
      while (i + 1 < lines.length && (lines[i + 1]!.startsWith(" ") || lines[i + 1]!.startsWith("\t") || lines[i + 1]!.trim() === "")) block.push(lines[++i]!.trim())
      meta[key] = value.trim().startsWith(">") ? block.filter(Boolean).join(" ") : block.join("\n").trim()
    } else {
      meta[key] = unquote(value)
    }
  }
  return { name: meta.name, description: meta.description, body: src.slice(m[0].length).replace(/^\n+/, "") }
}
