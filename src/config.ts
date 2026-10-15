import type { SourceKind, SourceSpec } from "./types.js"

export class ConfigError extends Error {}

export interface RouterOptions {
  sources: SourceSpec[]
  /** provider -> name -> environment variable that holds the API key. */
  auth: Record<string, Record<string, string>>
  cooldownMinutes: number
  /** Stay on the current source unless another is ahead by at least this fraction. */
  switchMargin: number
  /** Score used for sources with no usage check. */
  unknownScore: number
  usageTtlSeconds: number
}

const KINDS: Record<string, SourceKind> = {
  anthropic: "claude-oauth",
  "anthropic-api": "claude-api",
  openai: "openai",
  google: "google",
}
const NEEDS_ACCOUNT: SourceKind[] = ["claude-oauth", "claude-api"]

export function parseSourceKey(key: string): { kind: SourceKind; account?: string } {
  const at = key.indexOf("@")
  const provider = at === -1 ? key : key.slice(0, at)
  const account = at === -1 ? undefined : key.slice(at + 1).trim()
  const kind = KINDS[provider]
  if (!kind) throw new ConfigError(`Unknown source "${key}". Use one of: ${Object.keys(KINDS).join(", ")} (optionally "@account").`)
  if (NEEDS_ACCOUNT.includes(kind) && !account) {
    throw new ConfigError(`Source "${provider}" needs an account, e.g. "${provider}@name".`)
  }
  if (!NEEDS_ACCOUNT.includes(kind) && account) {
    throw new ConfigError(`Source "${provider}" does not take an account ("${key}").`)
  }
  return { kind, account }
}

function number(value: unknown, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ConfigError(`"${name}" must be a number between ${min} and ${max}.`)
  }
  return value
}

export function parseOptions(raw: unknown): RouterOptions {
  if (typeof raw !== "object" || raw === null) {
    throw new ConfigError('Missing plugin options. Use ["opencode-source-router", { "models": { ... } }].')
  }
  const o = raw as Record<string, unknown>
  const models = o.models
  if (typeof models !== "object" || models === null || Array.isArray(models) || Object.keys(models).length === 0) {
    throw new ConfigError('"models" must be an object like { "openai": "gpt-5.6-terra" } with at least one entry.')
  }
  const sources: SourceSpec[] = Object.entries(models).map(([key, modelID]) => {
    if (typeof modelID !== "string" || !modelID.trim()) throw new ConfigError(`Model for "${key}" must be a non-empty string.`)
    return { key, ...parseSourceKey(key), modelID: modelID.trim() }
  })

  const auth: RouterOptions["auth"] = {}
  if (o.auth !== undefined) {
    if (typeof o.auth !== "object" || o.auth === null) throw new ConfigError('"auth" must be an object.')
    for (const [provider, names] of Object.entries(o.auth)) {
      if (typeof names !== "object" || names === null) throw new ConfigError(`"auth.${provider}" must be an object of name -> ENV_VAR.`)
      auth[provider] = {}
      for (const [name, env] of Object.entries(names)) {
        if (typeof env !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(env)) {
          throw new ConfigError(`"auth.${provider}.${name}" must be an environment variable name, not a key.`)
        }
        auth[provider][name] = env
      }
    }
  }

  return {
    sources,
    auth,
    cooldownMinutes: number(o.cooldownMinutes, "cooldownMinutes", 15, 1, 24 * 60),
    switchMargin: number(o.switchMargin, "switchMargin", 0.1, 0, 1),
    unknownScore: number(o.unknownScore, "unknownScore", 0.5, 0, 1),
    usageTtlSeconds: number(o.usageTtlSeconds, "usageTtlSeconds", 180, 30, 3600),
  }
}
