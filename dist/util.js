import { execFile } from "node:child_process";
/** Caches an async value for `ttlMs`; concurrent callers share one in-flight call. */
export class TtlCache {
    ttlMs;
    value;
    inflight;
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    async get(load, now = Date.now()) {
        if (this.value && now - this.value.at < this.ttlMs)
            return this.value.data;
        this.inflight ??= load()
            .then((data) => {
            this.value = { at: Date.now(), data };
            return data;
        })
            .finally(() => {
            this.inflight = undefined;
        });
        return this.inflight;
    }
}
export function exec(file, args, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
}
export const clamp01 = (n) => Math.min(1, Math.max(0, n));
