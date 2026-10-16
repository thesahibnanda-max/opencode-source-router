import { classifyError, cooldownFor } from "./errors.js";
import { Cooldowns, choose } from "./router.js";
const PREPARE_FAILURE_COOLDOWN_MS = 5 * 60_000;
const sameModel = (a, b) => a.providerID === b.providerID && a.modelID === b.modelID;
export class Controller {
    sources;
    options;
    log;
    now;
    cooldowns = new Cooldowns();
    sessions = new Map();
    constructor(sources, options, log = () => { }, now = Date.now) {
        this.sources = sources;
        this.options = options;
        this.log = log;
        this.now = now;
    }
    session(id) {
        let s = this.sessions.get(id);
        if (!s)
            this.sessions.set(id, (s = { parts: [], attempts: 0, internal: false }));
        return s;
    }
    /** Called for each new user message. Returns the model to use, or undefined to leave it alone. */
    async route(sessionID, userModel, parts) {
        const s = this.session(sessionID);
        if (s.internal) {
            s.internal = false;
            return undefined;
        }
        if (userModel && s.lastInput && !sameModel(s.lastInput, userModel)) {
            s.pin = { kind: "manual" };
            this.log("info", `session ${sessionID}: model changed by hand, auto-routing paused (/auto-model to resume)`);
        }
        if (userModel)
            s.lastInput = userModel;
        s.parts = parts;
        s.attempts = 0;
        if (s.pin?.kind === "manual") {
            s.currentKey = undefined;
            return undefined;
        }
        const pinnedKey = s.pin?.kind === "source" ? s.pin.key : undefined;
        const picked = await this.pick(s, pinnedKey);
        return picked?.model;
    }
    /** Pick and prepare the best source. A source that cannot be prepared is skipped for a while. */
    async pick(s, onlyKey, exclude = []) {
        const tried = new Set(exclude);
        for (let i = 0; i < this.sources.length; i++) {
            const pool = this.sources.filter((src) => !tried.has(src.spec.key) && (onlyKey ? src.spec.key === onlyKey : !this.cooldowns.isCooling(src.spec.key, this.now())));
            if (pool.length === 0)
                return undefined;
            const candidates = await Promise.all(pool.map(async (src) => ({ key: src.spec.key, remaining: await src.remaining().catch(() => null) })));
            const key = onlyKey ?? choose(candidates, s.currentKey ?? null, this.options);
            const src = pool.find((p) => p.spec.key === key);
            if (!src)
                return undefined;
            try {
                await src.prepare();
                s.currentKey = src.spec.key;
                return src;
            }
            catch (err) {
                this.log("warn", `${src.spec.key} unavailable: ${err instanceof Error ? err.message : String(err)}`);
                this.cooldowns.set(src.spec.key, this.now() + PREPARE_FAILURE_COOLDOWN_MS);
                tried.add(src.spec.key);
                if (onlyKey)
                    return undefined;
            }
        }
        return undefined;
    }
    /** Called for `session.error`. Returns a retry to send, or undefined when nothing should be done. */
    async onError(sessionID, error) {
        const failure = classifyError(error);
        const s = this.sessions.get(sessionID);
        if (!failure || !s?.currentKey)
            return undefined;
        const failed = s.currentKey;
        const ms = cooldownFor(failure, this.options.cooldownMinutes * 60_000);
        this.cooldowns.set(failed, this.now() + ms);
        this.log("warn", `${failed}: ${failure.kind}, skipping for ${Math.round(ms / 60_000)} min`);
        if (s.pin || s.parts.length === 0 || s.attempts >= this.sources.length - 1)
            return undefined;
        s.attempts++;
        const next = await this.pick(s, undefined, [failed]);
        if (!next)
            return undefined;
        s.internal = true;
        return { model: next.model, key: next.spec.key, parts: s.parts };
    }
    /** The retry could not be sent: allow the next real message to be routed normally. */
    retryFailed(sessionID) {
        const s = this.sessions.get(sessionID);
        if (s)
            s.internal = false;
    }
    /** `/fix-model [source]`. Returns a message for the user. */
    fix(sessionID, ref) {
        const s = this.session(sessionID);
        if (ref) {
            const r = ref.trim().toLowerCase();
            const matches = this.sources.filter((x) => x.spec.key.toLowerCase() === r || x.spec.key.toLowerCase().startsWith(r) || x.spec.modelID.toLowerCase() === r);
            if (matches.length !== 1)
                return matches.length === 0 ? `No source matches "${ref}".` : `"${ref}" matches several sources, be more specific.`;
            s.pin = { kind: "source", key: matches[0].spec.key };
            return `Pinned to ${matches[0].spec.key} (${matches[0].spec.modelID}). /auto-model resumes routing.`;
        }
        s.pin = s.currentKey ? { kind: "source", key: s.currentKey } : { kind: "manual" };
        return s.currentKey ? `Pinned to ${s.currentKey}. /auto-model resumes routing.` : "Routing paused; your selected model is used as is. /auto-model resumes routing.";
    }
    auto(sessionID) {
        this.session(sessionID).pin = undefined;
        return "Auto-routing resumed.";
    }
    async status(sessionID) {
        const s = this.session(sessionID);
        const mode = !s.pin ? "auto" : s.pin.kind === "manual" ? "paused (manual model)" : `pinned to ${s.pin.key}`;
        const rows = await Promise.all(this.sources.map(async (src) => {
            const rem = await src.remaining().catch(() => null);
            const cool = this.cooldowns.remainingMs(src.spec.key, this.now());
            const left = rem === null ? "unknown" : `${Math.round(rem * 100)}% left`;
            const flags = [cool > 0 ? `cooling ${Math.ceil(cool / 60_000)}m` : "", src.describe()].filter(Boolean).join(", ");
            return `${s.currentKey === src.spec.key ? "*" : " "} ${src.spec.key} -> ${src.spec.modelID}: ${left} (${flags})`;
        }));
        return [`Source router: ${mode}`, ...rows].join("\n");
    }
}
