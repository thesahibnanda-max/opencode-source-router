import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { clamp01 } from "../util.js";
const STALE_MS = 6 * 3600_000;
export const antigravityFile = (home = homedir(), env = process.env) => join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode", "antigravity-accounts.json");
/**
 * Best remaining fraction across enabled accounts for a model family ("gemini" or "claude"),
 * using the quota cache opencode-antigravity-auth keeps. A window whose reset time has passed
 * counts as full. Returns null when there is no fresh cache.
 */
export function remainingFromAccounts(accounts, family, now = Date.now()) {
    const per = [];
    for (const a of accounts) {
        if (a.enabled === false || !a.cachedQuota)
            continue;
        if (!a.cachedQuotaUpdatedAt || now - a.cachedQuotaUpdatedAt > STALE_MS)
            continue;
        const fractions = [`${family}-weekly`, `${family}-nonweekly`]
            .map((k) => a.cachedQuota[k])
            .filter((q) => typeof q?.remainingFraction === "number")
            .map((q) => (q.resetTime && Date.parse(q.resetTime) <= now ? 1 : q.remainingFraction));
        if (fractions.length > 0)
            per.push(Math.min(...fractions));
    }
    return per.length === 0 ? null : clamp01(Math.max(...per));
}
/** Every Antigravity account with its cached quota windows, for display. */
export function antigravityUsage(accounts, now = Date.now()) {
    return accounts.map((a) => {
        const families = {};
        for (const [key, q] of Object.entries(a.cachedQuota ?? {})) {
            const m = /^(.+)-(weekly|nonweekly)$/.exec(key);
            if (!m || typeof q?.remainingFraction !== "number")
                continue;
            const resetsAt = q.resetTime ? Date.parse(q.resetTime) : NaN;
            const passed = !Number.isNaN(resetsAt) && resetsAt <= now;
            (families[m[1]] ??= []).push({
                label: m[2] === "weekly" ? "weekly" : "non-weekly",
                usedPercent: passed ? 0 : (1 - q.remainingFraction) * 100,
                resetsAt: Number.isNaN(resetsAt) || passed ? undefined : resetsAt,
            });
        }
        return {
            email: a.email ?? "(unknown account)",
            enabled: a.enabled !== false,
            stale: !a.cachedQuotaUpdatedAt || now - a.cachedQuotaUpdatedAt > STALE_MS,
            families,
        };
    });
}
export function readAntigravityAccounts(file = antigravityFile()) {
    try {
        const data = JSON.parse(readFileSync(file, "utf-8"));
        return Array.isArray(data?.accounts) ? data.accounts : [];
    }
    catch {
        return [];
    }
}
export class GoogleSource {
    spec;
    file;
    model;
    constructor(spec, file = antigravityFile()) {
        this.spec = spec;
        this.file = file;
        this.model = { providerID: "google", modelID: spec.modelID };
    }
    remaining() {
        try {
            const data = JSON.parse(readFileSync(this.file, "utf-8"));
            const family = /claude/i.test(this.spec.modelID) ? "claude" : "gemini";
            return Promise.resolve(Array.isArray(data?.accounts) ? remainingFromAccounts(data.accounts, family) : null);
        }
        catch {
            return Promise.resolve(null);
        }
    }
    async prepare() { }
    describe() {
        return "Antigravity";
    }
}
