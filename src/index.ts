import type { Plugin } from "@opencode-ai/plugin"
import { ConfigError, parseOptions } from "./config.js"
import { Controller, type ReplayPart } from "./controller.js"
import { buildCommands, buildSkillPrompt, type SkillCommand } from "./skills/commands.js"
import { discoverSkills } from "./skills/discover.js"
import { buildSources, createUsageHub, type UsageHub } from "./sources/index.js"
import { collectUsage, renderUsage } from "./usage.js"
import type { PluginClient } from "./types.js"

const ROUTER_COMMANDS = {
  sources: "Show every routed source with the quota left",
  "fix-model": "Stop auto-routing for this session (optionally pin a source: /fix-model openai)",
  "auto-model": "Resume auto-routing for this session",
} as const

const USAGE_COMMAND = { usage: "Show quota used on every signed-in Claude, Codex and Antigravity account" } as const

const toReplay = (parts: any[]): ReplayPart[] =>
  parts.flatMap((p): ReplayPart[] => {
    if (p?.type === "text" && !p.synthetic && typeof p.text === "string") return [{ type: "text", text: p.text }]
    if (p?.type === "file" && typeof p.url === "string") return [{ type: "file", mime: p.mime, url: p.url, filename: p.filename }]
    return []
  })

const SourceRouter: Plugin = async ({ client: rawClient, directory }, rawOptions) => {
  const client = rawClient as unknown as PluginClient
  const log = (level: "info" | "warn", message: string) => {
    void client.app?.log({ body: { service: "source-router", level, message } }).catch?.(() => {})
  }

  let controller: Controller
  let providers: Array<{ id: string; config: Record<string, unknown> }> = []
  let hub: UsageHub
  let routing = false
  let skillCommands: SkillCommand[] = []
  try {
    const options = parseOptions(rawOptions)
    hub = createUsageHub(options.usageTtlSeconds)
    const sources = buildSources(options, client, hub)
    providers = sources.flatMap((s) => s.provider?.() ?? [])
    controller = new Controller(sources, options, log)
    routing = sources.length > 0
    const skills = discoverSkills({ directory, tools: options.skills })
    skillCommands = buildCommands(skills, options.skills.exclude, [...Object.keys(USAGE_COMMAND), ...(routing ? Object.keys(ROUTER_COMMANDS) : [])])
    if (skillCommands.length > 0) log("info", `registered ${skillCommands.length} skill commands`)
  } catch (err) {
    log("warn", `disabled: ${err instanceof ConfigError || err instanceof Error ? err.message : String(err)}`)
    return {}
  }
  const skillByName = new Map(skillCommands.map((c) => [c.name, c]))
  const stub = (description: string) => ({ description, template: "$ARGUMENTS" })

  return {
    config: async (config) => {
      const cfg = config as any
      cfg.command = {
        ...Object.fromEntries(Object.entries(USAGE_COMMAND).map(([name, d]) => [name, stub(d)])),
        ...(routing ? Object.fromEntries(Object.entries(ROUTER_COMMANDS).map(([name, d]) => [name, stub(d)])) : {}),
        ...Object.fromEntries(skillCommands.map((c) => [c.name, stub(c.description)])),
        ...cfg.command,
      }
      if (providers.length > 0) cfg.provider = { ...Object.fromEntries(providers.map((p) => [p.id, p.config])), ...cfg.provider }
    },

    "chat.message": async (input, output) => {
      if (!routing) return
      try {
        const model = await controller.route(input.sessionID, input.model, toReplay(output.parts))
        if (model) output.message.model = model
      } catch (err) {
        log("warn", `routing skipped: ${err instanceof Error ? err.message : String(err)}`)
      }
    },

    event: async ({ event }) => {
      if (!routing || event.type !== "session.error") return
      const { sessionID, error } = event.properties
      if (!sessionID) return
      try {
        const retry = await controller.onError(sessionID, error)
        if (!retry) return
        log("info", `retrying on ${retry.key}`)
        const res = await client.session.promptAsync({
          path: { id: sessionID },
          body: { model: retry.model, parts: retry.parts },
        })
        if (res.error) {
          controller.retryFailed(sessionID)
          log("warn", "retry could not be sent")
        }
      } catch (err) {
        controller.retryFailed(sessionID)
        log("warn", `failover failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },

    "command.execute.before": async (input, output) => {
      const part = output.parts.find((p) => p.type === "text") as { text: string } | undefined
      if (!part) return
      const skill = skillByName.get(input.command)
      if (skill) {
        part.text = buildSkillPrompt(skill, input.arguments)
        return
      }
      if (input.command === "usage") {
        part.text = `Reply with exactly the text below and nothing else:\n\n${renderUsage(await collectUsage({ hub }))}`
        return
      }
      if (!routing || !(input.command in ROUTER_COMMANDS)) return
      const arg = input.arguments.trim()
      const reply =
        input.command === "sources"
          ? await controller.status(input.sessionID)
          : input.command === "fix-model"
            ? controller.fix(input.sessionID, arg || undefined)
            : controller.auto(input.sessionID)
      part.text = `Reply with exactly the text below and nothing else:\n\n${reply}`
    },
  }
}

// A single default export: opencode may call every export of a plugin module as a plugin.
export default { id: "opencode-source-router", server: SourceRouter }
