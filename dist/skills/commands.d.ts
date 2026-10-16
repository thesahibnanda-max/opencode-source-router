import type { Skill } from "./discover.js";
export interface SkillCommand {
    /** Command name without the leading slash, e.g. `claude-pdf`. */
    name: string;
    description: string;
    skill: Skill;
}
/** `*` and `?` globs, case-insensitive, matched against the whole command name. */
export declare function globToRegExp(glob: string): RegExp;
/**
 * Name each skill `<tool>-<skill>` (no doubled prefix: Antigravity's `agy-customizations` stays
 * `agy-customizations`). On a clash a plugin skill becomes `<tool>-<plugin>-<skill>`, then gets
 * a numeric suffix. Earlier skills win, so personal skills keep the short name.
 */
export declare function buildCommands(skills: Skill[], exclude?: string[], reserved?: string[]): SkillCommand[];
/** The message sent when a skill command runs. Read from disk at run time, so edits apply without a restart. */
export declare function buildSkillPrompt(command: SkillCommand, args: string): string;
