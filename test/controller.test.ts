import { describe, expect, it } from "vitest"
import { Controller } from "../src/controller.js"
import type { Source } from "../src/types.js"

function fake(key: string, remaining: number | null, opts: { failPrepare?: boolean } = {}): Source & { prepared: number } {
  const [provider] = key.split("@")
  const s = {
    spec: { key, kind: "openai" as const, modelID: `${key}-model` },
    model: { providerID: provider!, modelID: `${key}-model` },
    prepared: 0,
    remaining: async () => remaining,
    prepare: async () => {
      if (opts.failPrepare) throw new Error("nope")
      s.prepared++
    },
    describe: () => key,
  }
  return s
}

const options = { cooldownMinutes: 15, switchMargin: 0.1, unknownScore: 0.5 }
const text = [{ type: "text" as const, text: "hi" }]
const rateLimit = { name: "APIError", data: { message: "slow down", statusCode: 429, isRetryable: true } }

describe("Controller.route", () => {
  it("routes to the source with most quota left and prepares it", async () => {
    const a = fake("a", 0.2)
    const b = fake("b", 0.9)
    const c = new Controller([a, b], options)
    expect(await c.route("s1", { providerID: "x", modelID: "y" }, text)).toEqual(b.model)
    expect(b.prepared).toBe(1)
    expect(a.prepared).toBe(0)
  })

  it("skips sources in cooldown", async () => {
    let t = 0
    const a = fake("a", 0.9)
    const b = fake("b", 0.1)
    const c = new Controller([a, b], options, () => {}, () => t)
    c.cooldowns.set("a", 1000)
    expect((await c.route("s1", undefined, text))?.modelID).toBe("b-model")
    t = 2000
    expect((await c.route("s2", undefined, text))?.modelID).toBe("a-model")
  })

  it("skips a source whose prepare fails and uses the next", async () => {
    const a = fake("a", 0.9, { failPrepare: true })
    const b = fake("b", 0.1)
    const c = new Controller([a, b], options)
    expect((await c.route("s1", undefined, text))?.modelID).toBe("b-model")
    expect(c.cooldowns.isCooling("a")).toBe(true)
  })

  it("returns nothing when every source is cooling", async () => {
    const a = fake("a", 0.9)
    const c = new Controller([a], options)
    c.cooldowns.set("a", Date.now() + 60_000)
    expect(await c.route("s1", undefined, text)).toBeUndefined()
  })
})

describe("pinning", () => {
  it("a hand-picked model pauses routing until /auto-model", async () => {
    const c = new Controller([fake("a", 0.9)], options)
    await c.route("s1", { providerID: "p", modelID: "one" }, text)
    expect(await c.route("s1", { providerID: "p", modelID: "two" }, text)).toBeUndefined()
    expect(await c.route("s1", { providerID: "p", modelID: "two" }, text)).toBeUndefined()
    c.auto("s1")
    expect((await c.route("s1", { providerID: "p", modelID: "two" }, text))?.modelID).toBe("a-model")
  })

  it("/fix-model pins the current source; /fix-model <source> pins another", async () => {
    const a = fake("a", 0.9)
    const b = fake("b", 0.1)
    const c = new Controller([a, b], options)
    await c.route("s1", undefined, text)
    expect(c.fix("s1")).toMatch(/Pinned to a/)
    a.remaining = async () => 0
    expect((await c.route("s1", undefined, text))?.modelID).toBe("a-model")
    expect(c.fix("s1", "b")).toMatch(/Pinned to b/)
    expect((await c.route("s1", undefined, text))?.modelID).toBe("b-model")
    expect(c.fix("s1", "zzz")).toMatch(/No source/)
  })

  it("does not fail over while pinned, but still cools the source", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", 0.1)], options)
    await c.route("s1", undefined, text)
    c.fix("s1")
    expect(await c.onError("s1", rateLimit)).toBeUndefined()
    expect(c.cooldowns.isCooling("a")).toBe(true)
  })
})

describe("onError", () => {
  it("cools the failing source and retries the same message on the next one", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", 0.1)], options)
    await c.route("s1", undefined, text)
    const retry = await c.onError("s1", rateLimit)
    expect(retry?.key).toBe("b")
    expect(retry?.parts).toEqual(text)
    expect(c.cooldowns.isCooling("a")).toBe(true)
  })

  it("does not route the retry's own chat.message again", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", 0.1)], options)
    await c.route("s1", undefined, text)
    await c.onError("s1", rateLimit)
    expect(await c.route("s1", { providerID: "b", modelID: "b-model" }, text)).toBeUndefined()
    c.cooldowns.clear()
    expect((await c.route("s1", { providerID: "b", modelID: "b-model" }, text))?.modelID).toBe("a-model")
  })

  it("stops after every source has been tried once", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", 0.1)], options)
    await c.route("s1", undefined, text)
    expect((await c.onError("s1", rateLimit))?.key).toBe("b")
    expect(await c.onError("s1", rateLimit)).toBeUndefined()
  })

  it("ignores errors that are not the source's fault and sessions it did not route", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", 0.1)], options)
    await c.route("s1", undefined, text)
    expect(await c.onError("s1", { name: "MessageAbortedError", data: {} })).toBeUndefined()
    expect(await c.onError("other", rateLimit)).toBeUndefined()
  })

  it("has nothing to retry with when there is no other source", async () => {
    const c = new Controller([fake("a", 0.9)], options)
    await c.route("s1", undefined, text)
    expect(await c.onError("s1", rateLimit)).toBeUndefined()
  })
})

describe("status", () => {
  it("lists sources with quota, cooldown and the active marker", async () => {
    const c = new Controller([fake("a", 0.9), fake("b", null)], options)
    await c.route("s1", undefined, text)
    c.cooldowns.set("b", Date.now() + 5 * 60_000)
    const out = await c.status("s1")
    expect(out).toMatch(/Source router: auto/)
    expect(out).toMatch(/\* a -> a-model: 90% left/)
    expect(out).toMatch(/b -> b-model: unknown \(cooling 5m/)
  })
})
