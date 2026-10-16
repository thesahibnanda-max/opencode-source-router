const QUOTA_TEXT = /quota|credit|usage limit|rate.?limit|too many requests|exceeded|insufficient/i;
function retryAfter(headers) {
    if (!headers)
        return undefined;
    const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
    const seconds = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0)
        return undefined;
    return Math.min(Math.max(seconds, 10), 6 * 3600) * 1000;
}
/**
 * Turn the `error` of a `session.error` event into a failure worth failing over for.
 * Returns undefined for errors that are not the source's fault (aborts, context overflow, ...).
 */
export function classifyError(error) {
    if (typeof error !== "object" || error === null)
        return undefined;
    const e = error;
    if (e.name === "ProviderAuthError")
        return { kind: "auth" };
    if (e.name !== "APIError")
        return undefined;
    const { statusCode, message = "", isRetryable, responseHeaders } = e.data ?? {};
    const wait = retryAfter(responseHeaders);
    if (statusCode === 429)
        return { kind: "rate-limit", retryAfterMs: wait };
    if (statusCode === 402)
        return { kind: "quota", retryAfterMs: wait };
    if (statusCode === 401 || statusCode === 403)
        return { kind: QUOTA_TEXT.test(message) ? "quota" : "auth", retryAfterMs: wait };
    if (statusCode !== undefined && statusCode >= 500)
        return { kind: "overloaded", retryAfterMs: wait };
    if (QUOTA_TEXT.test(message))
        return { kind: "rate-limit", retryAfterMs: wait };
    if (isRetryable)
        return { kind: "overloaded", retryAfterMs: wait };
    return undefined;
}
/** How long to skip a source after a failure. */
export function cooldownFor(failure, baseMs) {
    if (failure.retryAfterMs !== undefined)
        return failure.retryAfterMs;
    switch (failure.kind) {
        case "overloaded":
            return Math.min(baseMs, 2 * 60_000);
        case "auth":
            return Math.max(baseMs, 60 * 60_000);
        default:
            return baseMs;
    }
}
