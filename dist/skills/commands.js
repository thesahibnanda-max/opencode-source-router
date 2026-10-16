import { readFileSync } from "node:fs";
import { parseSkill } from "./frontmatter.js";
const slug = (s) => s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
/** `*` and `?` globs, case-insensitive, matched against the whole command name. */
export function globToRegExp(glob) {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`, "i");
}
/**
 * Name each skill `<tool>-<skill>` (no doubled prefix: Antigravity's `agy-customizations` stays
 * `agy-customizations`). On a clash a plugin skill becomes `<tool>-<plugin>-<skill>`, then gets
 * a numeric suffix. Earlier skills win, so personal skills keep the short name.
 */
export function buildCommands(skills, exclude = [], reserved = []) {
    const excluded = exclude.map(globToRegExp);
    const taken = new Set(reserved);
    const out = [];
    for (const skill of skills) {
        const base = slug(skill.name);
        if (!base)
            continue;
        const short = base.startsWith(`${skill.tool}-`) ? base : `${skill.tool}-${base}`;
        const candidates = [short, ...(skill.plugin ? [`${skill.tool}-${slug(skill.plugin)}-${base}`] : [])];
        let name = candidates.find((c) => !taken.has(c));
        for (let n = 2; !name; n++) {
            const numbered = `${candidates[candidates.length - 1]}-${n}`;
            if (!taken.has(numbered))
                name = numbered;
        }
        taken.add(name);
        if (excluded.some((re) => re.test(name)))
            continue;
        const where = skill.plugin ? `${skill.tool}/${skill.plugin}` : skill.tool;
        const desc = skill.description.replace(/\s+/g, " ");
        out.push({ name, description: `[${where}] ${desc.length > 180 ? `${desc.slice(0, 177)}...` : desc}`.trim(), skill });
    }
    return out;
}
/** The message sent when a skill command runs. Read from disk at run time, so edits apply without a restart. */
export function buildSkillPrompt(command, args) {
    const { skill } = command;
    let body;
    try {
        body = parseSkill(readFileSync(skill.file, "utf-8")).body.trim();
    }
    catch {
        return `The skill file ${skill.file} could not be read. Tell the user.`;
    }
    const source = skill.plugin ? `${skill.tool} plugin "${skill.plugin}"` : skill.tool;
    return [
        `The user ran /${command.name}. Apply the "${skill.name}" skill from ${source} to their request, following its instructions as written.`,
        `Skill directory (resolve relative paths in the skill against it): ${skill.dir}`,
        `User request: ${args.trim() || "(none given: use the conversation so far)"}`,
        "",
        "--- SKILL ---",
        body,
    ].join("\n");
}
