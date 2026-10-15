import { describe, expect, it } from "vitest"
import { Cooldowns, choose } from "../src/router.js"

const opts = { unknownScore: 0.5, switchMargin: 0.1 }

describe("choose", () => {
  it("picks the most quota left", () => {
    expect(choose([{ key: "a", remaining: 0.2 }, { key: "b", remaining: 0.9 }], null, opts)).toBe("b")
  })
  it("breaks ties by config order", () => {
    expect(choose([{ key: "a", remaining: 0.5 }, { key: "b", remaining: 0.5 }], null, opts)).toBe("a")
  })
  it("treats unknown as the neutral score", () => {
    expect(choose([{ key: "a", remaining: 0.3 }, { key: "b", remaining: null }], null, opts)).toBe("b")
    expect(choose([{ key: "a", remaining: 0.8 }, { key: "b", remaining: null }], null, opts)).toBe("a")
  })
  it("stays on the current source inside the margin, moves beyond it", () => {
    const c = [{ key: "a", remaining: 0.5 }, { key: "b", remaining: 0.58 }]
    expect(choose(c, "a", opts)).toBe("a")
    expect(choose([{ key: "a", remaining: 0.5 }, { key: "b", remaining: 0.7 }], "a", opts)).toBe("b")
  })
  it("ignores a current source that is no longer a candidate", () => {
    expect(choose([{ key: "b", remaining: 0.1 }], "a", opts)).toBe("b")
  })
  it("returns null with no candidates", () => {
    expect(choose([], null, opts)).toBeNull()
  })
})

describe("Cooldowns", () => {
  it("expires", () => {
    const c = new Cooldowns()
    c.set("a", 1000)
    expect(c.isCooling("a", 999)).toBe(true)
    expect(c.isCooling("a", 1000)).toBe(false)
    expect(c.remainingMs("a", 400)).toBe(600)
  })
})
