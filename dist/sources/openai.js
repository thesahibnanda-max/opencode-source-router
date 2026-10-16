import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { TtlCache, clamp01 } from "../util.js";
/** Fraction left from a `account/rateLimits/read` result, or null when it has no windows. */
export function remainingFromCodex(result) {
    if (result?.ordinaryUsageAllowed === false)
        return 0;
    const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
    const used = [limits?.primary, limits?.secondary]
        .map((w) => w?.usedPercent)
        .filter((u) => typeof u === "number");
    return used.length === 0 ? null : clamp01(1 - Math.max(...used) / 100);
}
const windowLabel = (mins) => (mins === 300 ? "5h" : mins === 10080 ? "7d" : typeof mins === "number" ? `${mins}m` : "window");
/** Windows and plan name from a `account/rateLimits/read` result, for display. */
export function codexWindows(result) {
    const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
    const windows = [];
    for (const w of [limits?.primary, limits?.secondary]) {
        if (typeof w?.usedPercent !== "number")
            continue;
        windows.push({ label: windowLabel(w.windowDurationMins), usedPercent: w.usedPercent, resetsAt: typeof w.resetsAt === "number" ? w.resetsAt * 1000 : undefined });
    }
    return { plan: typeof limits?.planType === "string" ? limits.planType : undefined, windows };
}
/** Cached live Codex limits, shared by the router and `/usage`. Resolves null when Codex is missing or signed out. */
export class CodexUsageStore {
    read;
    cache;
    constructor(ttlMs, read = () => readCodexLimits()) {
        this.read = read;
        this.cache = new TtlCache(ttlMs);
    }
    get() {
        return this.cache.get(() => this.read().catch(() => null));
    }
}
/** Ask the local Codex CLI (app-server over stdio) for the live ChatGPT plan limits. */
export function readCodexLimits(bin = "codex", timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, ["app-server"], { stdio: ["pipe", "pipe", "ignore"] });
        const done = (fn) => {
            clearTimeout(timer);
            child.kill();
            fn();
        };
        const timer = setTimeout(() => done(() => reject(new Error("codex app-server timed out"))), timeoutMs);
        child.on("error", (e) => done(() => reject(e)));
        const lines = createInterface({ input: child.stdout });
        lines.on("line", (line) => {
            let m;
            try {
                m = JSON.parse(line);
            }
            catch {
                return;
            }
            if (m.id === 1) {
                child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
                child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "account/rateLimits/read" }) + "\n");
            }
            else if (m.id === 2) {
                done(() => (m.error ? reject(new Error("codex rate limits unavailable")) : resolve(m.result)));
            }
        });
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { clientInfo: { name: "opencode-source-router", version: "0" }, capabilities: {} } }) + "\n");
    });
}
export class OpenAISource {
    spec;
    usage;
    model;
    constructor(spec, usage) {
        this.spec = spec;
        this.usage = usage;
        this.model = { providerID: "openai", modelID: spec.modelID };
    }
    async remaining() {
        const result = await this.usage.get();
        return result === null ? null : remainingFromCodex(result);
    }
    async prepare() { }
    describe() {
        return "OpenAI / Codex";
    }
}
