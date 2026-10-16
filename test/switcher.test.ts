import { describe, expect, it, vi } from "vitest"
import { ClaudeSwitcher } from "../src/sources/claude-oauth.js"
import type { PluginClient } from "../src/types.js"

const reply = (service: string) => ({ data: { instructions: `Using Claude Pro: me@example.com — credentials loaded from macOS Keychain (${service}).` } })

function client(opts: { list?: () => Promise<any>; authorize: (method: number, service: string) => any }) {
  const authorize = vi.fn(async ({ body }: any) => opts.authorize(body.method, body.inputs.account))
  const callback = vi.fn(async () => ({}))
  const c = { provider: { auth: opts.list ?? (async () => ({ data: { anthropic: [{ type: "oauth", label: "Switch Claude Code account" }] } })), oauth: { authorize, callback } }, session: {} } as unknown as PluginClient
  return { c, authorize, callback }
}

describe("ClaudeSwitcher", () => {
  it("uses the listed method index when listing works", async () => {
    const { c, authorize } = client({ list: async () => ({ data: { anthropic: [{ type: "oauth", label: "Other" }, { type: "oauth", label: "Switch Claude Code account" }] } }), authorize: (_m, s) => reply(s) })
    await new ClaudeSwitcher(c).switchTo("svc")
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(authorize.mock.calls[0]![0].body.method).toBe(1)
  })

  it("falls back to probing when listing fails, and stops at the confirmed method", async () => {
    const { c, authorize, callback } = client({
      list: async () => {
        throw new Error("HTTP 500")
      },
      authorize: (m, s) => (m === 0 ? reply(s) : { error: true }),
    })
    await new ClaudeSwitcher(c).switchTo("svc")
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("rejects a reply that activated a different Keychain entry", async () => {
    const { c } = client({ list: async () => Promise.reject(new Error("500")), authorize: () => reply("some-other-service") })
    await expect(new ClaudeSwitcher(c).switchTo("svc")).rejects.toThrow(/did not confirm/)
  })

  it("skips indexes that error and does not switch twice to the same account", async () => {
    const { c, authorize } = client({ list: async () => Promise.reject(new Error("500")), authorize: (m, s) => (m === 2 ? reply(s) : Promise.reject(new Error("boom"))) })
    const sw = new ClaudeSwitcher(c)
    await sw.switchTo("svc")
    await sw.switchTo("svc")
    expect(authorize).toHaveBeenCalledTimes(3)
  })
})
