import { describe, expect, it } from "vitest"
import { classifyError, cooldownFor } from "../src/errors.js"

const api = (statusCode: number | undefined, message = "x", extra: object = {}) => ({ name: "APIError", data: { message, statusCode, isRetryable: false, ...extra } })

describe("classifyError", () => {
  it("maps status codes", () => {
    expect(classifyError(api(429))?.kind).toBe("rate-limit")
    expect(classifyError(api(402))?.kind).toBe("quota")
    expect(classifyError(api(401, "invalid x-api-key"))?.kind).toBe("auth")
    expect(classifyError(api(529))?.kind).toBe("overloaded")
  })
  it("reads Retry-After case-insensitively and bounds it", () => {
    expect(classifyError(api(429, "x", { responseHeaders: { "Retry-After": "120" } }))?.retryAfterMs).toBe(120_000)
    expect(classifyError(api(429, "x", { responseHeaders: { "retry-after": "1" } }))?.retryAfterMs).toBe(10_000)
  })
  it("detects quota wording without a status code", () => {
    expect(classifyError(api(undefined, "You exceeded your usage limit"))?.kind).toBe("rate-limit")
  })
  it("ignores errors that are not the source's fault", () => {
    expect(classifyError({ name: "MessageAbortedError", data: {} })).toBeUndefined()
    expect(classifyError(api(400, "bad request"))).toBeUndefined()
    expect(classifyError(undefined)).toBeUndefined()
  })
  it("treats provider auth errors as auth", () => {
    expect(classifyError({ name: "ProviderAuthError", data: {} })?.kind).toBe("auth")
  })
})

describe("cooldownFor", () => {
  it("prefers the server's wait, shortens overload, lengthens auth", () => {
    const base = 15 * 60_000
    expect(cooldownFor({ kind: "rate-limit", retryAfterMs: 5000 }, base)).toBe(5000)
    expect(cooldownFor({ kind: "overloaded" }, base)).toBe(2 * 60_000)
    expect(cooldownFor({ kind: "auth" }, base)).toBe(60 * 60_000)
    expect(cooldownFor({ kind: "rate-limit" }, base)).toBe(base)
  })
})
