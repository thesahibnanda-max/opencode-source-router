export interface SkillMeta {
    name?: string;
    description?: string;
    /** Skill instructions without the frontmatter block. */
    body: string;
}
/** Reads `name` and `description` from a SKILL.md frontmatter block (plain, quoted, folded `>` and literal `|` values). */
export declare function parseSkill(text: string): SkillMeta;
