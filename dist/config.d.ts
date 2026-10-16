import type { SourceKind, SourceSpec } from "./types.js";
export declare class ConfigError extends Error {
}
export interface SkillsOptions {
    claude: boolean;
    codex: boolean;
    agy: boolean;
    /** Glob patterns matched against command names, e.g. `codex-*-research`. */
    exclude: string[];
}
export interface RouterOptions {
    sources: SourceSpec[];
    skills: SkillsOptions;
    /** provider -> name -> environment variable that holds the API key. */
    auth: Record<string, Record<string, string>>;
    cooldownMinutes: number;
    /** Stay on the current source unless another is ahead by at least this fraction. */
    switchMargin: number;
    /** Score used for sources with no usage check. */
    unknownScore: number;
    usageTtlSeconds: number;
}
export declare function parseSourceKey(key: string): {
    kind: SourceKind;
    account?: string;
};
export declare function parseOptions(raw: unknown): RouterOptions;
