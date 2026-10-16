export class ConfigError extends Error {
}
const KINDS = {
    anthropic: "claude-oauth",
    "anthropic-api": "claude-api",
    openai: "openai",
    google: "google",
};
const NEEDS_ACCOUNT = ["claude-oauth", "claude-api"];
export function parseSourceKey(key) {
    const at = key.indexOf("@");
    const provider = at === -1 ? key : key.slice(0, at);
    const account = at === -1 ? undefined : key.slice(at + 1).trim();
    const kind = KINDS[provider];
    if (!kind)
        throw new ConfigError(`Unknown source "${key}". Use one of: ${Object.keys(KINDS).join(", ")} (optionally "@account").`);
    if (NEEDS_ACCOUNT.includes(kind) && !account) {
        throw new ConfigError(`Source "${provider}" needs an account, e.g. "${provider}@name".`);
    }
    if (!NEEDS_ACCOUNT.includes(kind) && account) {
        throw new ConfigError(`Source "${provider}" does not take an account ("${key}").`);
    }
    return { kind, account };
}
function number(value, name, fallback, min, max) {
    if (value === undefined)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new ConfigError(`"${name}" must be a number between ${min} and ${max}.`);
    }
    return value;
}
function parseSkills(raw) {
    if (raw === undefined)
        return { claude: true, codex: true, agy: true, exclude: [] };
    if (raw === false)
        return { claude: false, codex: false, agy: false, exclude: [] };
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new ConfigError('"skills" must be false or an object like { "codex": false, "exclude": ["claude-demo-*"] }.');
    }
    const o = raw;
    const flag = (name) => {
        if (o[name] !== undefined && typeof o[name] !== "boolean")
            throw new ConfigError(`"skills.${name}" must be true or false.`);
        return o[name] !== false;
    };
    const exclude = o.exclude ?? [];
    if (!Array.isArray(exclude) || exclude.some((e) => typeof e !== "string" || !e)) {
        throw new ConfigError('"skills.exclude" must be a list of glob patterns.');
    }
    return { claude: flag("claude"), codex: flag("codex"), agy: flag("agy"), exclude: exclude };
}
export function parseOptions(raw) {
    if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
        throw new ConfigError('Plugin options must be an object: ["opencode-source-router", { "models": { ... } }].');
    }
    const o = (raw ?? {});
    const models = o.models ?? {};
    if (typeof models !== "object" || models === null || Array.isArray(models)) {
        throw new ConfigError('"models" must be an object like { "openai": "gpt-5.6-terra" }.');
    }
    const skills = parseSkills(o.skills);
    if (Object.keys(models).length === 0 && !skills.claude && !skills.codex && !skills.agy) {
        throw new ConfigError('Nothing to do: add at least one entry to "models" or leave "skills" enabled.');
    }
    const sources = Object.entries(models).map(([key, modelID]) => {
        if (typeof modelID !== "string" || !modelID.trim())
            throw new ConfigError(`Model for "${key}" must be a non-empty string.`);
        return { key, ...parseSourceKey(key), modelID: modelID.trim() };
    });
    const auth = {};
    if (o.auth !== undefined) {
        if (typeof o.auth !== "object" || o.auth === null)
            throw new ConfigError('"auth" must be an object.');
        for (const [provider, names] of Object.entries(o.auth)) {
            if (typeof names !== "object" || names === null)
                throw new ConfigError(`"auth.${provider}" must be an object of name -> ENV_VAR.`);
            auth[provider] = {};
            for (const [name, env] of Object.entries(names)) {
                if (typeof env !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(env)) {
                    throw new ConfigError(`"auth.${provider}.${name}" must be an environment variable name, not a key.`);
                }
                auth[provider][name] = env;
            }
        }
    }
    return {
        sources,
        skills,
        auth,
        cooldownMinutes: number(o.cooldownMinutes, "cooldownMinutes", 15, 1, 24 * 60),
        switchMargin: number(o.switchMargin, "switchMargin", 0.1, 0, 1),
        unknownScore: number(o.unknownScore, "unknownScore", 0.5, 0, 1),
        usageTtlSeconds: number(o.usageTtlSeconds, "usageTtlSeconds", 180, 30, 3600),
    };
}
