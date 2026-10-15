# opencode-source-router

An [opencode](https://opencode.ai) plugin that sends each message to whichever of your model
"sources" has the most quota left, and fails over to the next one when a provider rate-limits you.

A source is one login or key plus one model: a Claude OAuth account, a Claude API key, Codex, or
Antigravity. Several Claude accounts are supported, in any mix of OAuth and API keys.

## How it works

- **Before each message** the plugin reads the quota left on every source and rewrites the message's
  model to the best one. It stays on the current source unless another is ahead by `switchMargin`,
  so a conversation does not bounce between providers over small differences.
- **On a rate limit or quota error** the failing source is skipped for a cooldown (the server's
  `Retry-After` when present) and the same message is re-sent to the next best source.
- **`/fix-model`** stops routing for the session. Picking a model by hand with `/models` also pauses it.

| Source | Quota is read from | Without a usage check |
|---|---|---|
| `anthropic@<account>` (OAuth) | Anthropic's OAuth usage endpoint (5h and 7d windows) | treated as unknown |
| `anthropic-api@<name>` (API key) | none: API keys have no percentage | ordered by config, failover on errors |
| `openai` (Codex plan) | `codex app-server`, if the Codex CLI is installed and logged in | treated as unknown |
| `google` (Antigravity) | the quota cache of `opencode-antigravity-auth` | treated as unknown |

A source with unknown quota scores `unknownScore` (default 0.5) and is skipped only after it errors.

## Install

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugin": [
    ["opencode-source-router", {
      "models": {
        "anthropic@work":       "claude-opus-5",          // Claude OAuth login: slot, alias or email
        "anthropic-api@backup": "claude-sonnet-5",        // Claude API key (see "auth")
        "openai":               "gpt-5.6-terra",
        "google":               "antigravity-gemini-3.8-flash-tiered"
      },
      "auth": { "anthropic-api": { "backup": "BACKUP_ANTHROPIC_KEY" } }
    }]
  ]
}
```

Leave a source out and it is never used. opencode rejects unknown top-level keys, so the settings
live in the plugin's options as above. `auth` names an environment variable per API-key source;
the key itself never goes in the file.

Optional tuning (all inside the same options object): `cooldownMinutes` (15), `switchMargin` (0.1),
`unknownScore` (0.5), `usageTtlSeconds` (180).

### Requirements

- Claude OAuth sources need [`opencode-claude-auth`](https://github.com/griffinmartin/opencode-claude-auth)
  loaded too: it provides the Claude login and the account switch this plugin calls.
- Each extra Claude login must exist as its own Keychain entry. Accounts are found from
  [claude-swap](https://github.com/realiti4/claude-swap) profiles when present, otherwise from
  `~/.<dir>/.claude.json` config directories (log in with `CLAUDE_CONFIG_DIR=~/.claude-b claude`).
  A new session profile only gets its Keychain entry after Claude first refreshes its token.
- macOS Keychain is the tested path. Other platforms fall back to `<config dir>/.credentials.json`.

## Commands

| Command | Does |
|---|---|
| `/sources` | list sources, quota left, cooldowns, and which one this session is using |
| `/fix-model [source]` | stop routing; with an argument, pin that source (`/fix-model openai`) |
| `/auto-model` | resume routing |

Each command costs one short model turn, because opencode runs commands through the model.

## Limits

- Failover re-sends the last message, so it shows up twice in the session history.
- The Anthropic usage endpoint has a small request budget; results are cached for `usageTtlSeconds`
  and backed off after a 429.
- Switching Claude account goes through `opencode-claude-auth`, which also records the choice in its
  own state file, so a new opencode window may start on the account used last.
- Hand-picking a different model in `/models`, or switching to an agent with its own model, pauses routing.

## Development

```sh
npm install
npm test        # vitest
npm run build   # tsc -> dist/
```

MIT licensed.
