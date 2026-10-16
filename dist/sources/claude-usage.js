import { clamp01, TtlCache } from "../util.js";
import { readCredentials } from "./claude-accounts.js";
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA = "oauth-2025-04-20";
export class UsageError extends Error {
    status;
    retryAfterMs;
    constructor(message, status, retryAfterMs) {
        super(message);
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}
export function windowsFromUsage(data) {
    const out = [];
    for (const [label, w] of [["5h", data.five_hour], ["7d", data.seven_day]]) {
        if (typeof w?.utilization !== "number")
            continue;
        const resetsAt = w.resets_at ? Date.parse(w.resets_at) : NaN;
        out.push({ label, usedPercent: w.utilization, resetsAt: Number.isNaN(resetsAt) ? undefined : resetsAt });
    }
    if (out.length === 0)
        throw new UsageError("usage response had no 5h/7d windows");
    return out;
}
/** Fraction left on the tightest window. */
export const remainingFromWindows = (windows) => clamp01(1 - Math.max(...windows.map((w) => w.usedPercent)) / 100);
export const remainingFromUsage = (data) => remainingFromWindows(windowsFromUsage(data));
export async function fetchClaudeWindows(accessToken, fetchImpl = fetch) {
    const res = await fetchImpl(USAGE_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, "anthropic-beta": OAUTH_BETA, "User-Agent": "opencode-source-router" },
        signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
        const ra = Number(res.headers.get("retry-after"));
        throw new UsageError(`usage http ${res.status}`, res.status, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
    }
    return windowsFromUsage((await res.json()));
}
/**
 * Per-account usage, cached and backed off. Anthropic's usage endpoint allows only a few dozen requests
 * an hour, so the router and `/usage` share one store.
 */
export class ClaudeUsageStore {
    ttlMs;
    fetchWindows;
    read;
    now;
    caches = new Map();
    blockedUntil = new Map();
    constructor(ttlMs, fetchWindows = fetchClaudeWindows, read = readCredentials, now = Date.now) {
        this.ttlMs = ttlMs;
        this.fetchWindows = fetchWindows;
        this.read = read;
        this.now = now;
    }
    get(account) {
        let cache = this.caches.get(account.service);
        if (!cache)
            this.caches.set(account.service, (cache = new TtlCache(this.ttlMs)));
        return cache.get(async () => {
            const creds = await this.read(account);
            if (!creds)
                return { error: "not signed in" };
            if (creds.expiresAt && creds.expiresAt < this.now())
                return { error: "token expired (use Claude once to refresh it)" };
            if (this.now() < (this.blockedUntil.get(account.service) ?? 0))
                return { error: "rate-limited by Anthropic, try again later" };
            try {
                return { windows: await this.fetchWindows(creds.accessToken) };
            }
            catch (err) {
                if (err instanceof UsageError && err.status === 429)
                    this.blockedUntil.set(account.service, this.now() + (err.retryAfterMs ?? 10 * 60_000));
                return { error: err instanceof UsageError && err.status ? `unavailable (HTTP ${err.status})` : "unavailable" };
            }
        });
    }
}
