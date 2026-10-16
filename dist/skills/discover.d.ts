export type SkillTool = "claude" | "codex" | "agy";
export interface Skill {
    tool: SkillTool;
    /** Skill name from its frontmatter, or the folder name. */
    name: string;
    /** Plugin the skill comes from, when it is not a personal or project skill. */
    plugin?: string;
    description: string;
    /** Absolute path to SKILL.md. */
    file: string;
    /** Folder holding SKILL.md (relative paths in the skill resolve against it). */
    dir: string;
}
export interface DiscoverOptions {
    home?: string;
    /** Project directory, for project-level skill folders. */
    directory?: string;
    tools?: Partial<Record<SkillTool, boolean>>;
}
/** `[plugins."name@marketplace"]` tables with `enabled = true` in Codex's config.toml. */
export declare function enabledCodexPlugins(toml: string): string[];
/** Skills of Claude Code, Codex and Antigravity that are installed on this machine. */
export declare function discoverSkills(opts?: DiscoverOptions): Skill[];
