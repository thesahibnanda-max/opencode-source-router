/** Caches an async value for `ttlMs`; concurrent callers share one in-flight call. */
export declare class TtlCache<T> {
    private ttlMs;
    private value;
    private inflight;
    constructor(ttlMs: number);
    get(load: () => Promise<T>, now?: number): Promise<T>;
}
export declare function exec(file: string, args: string[], timeoutMs?: number): Promise<string>;
export declare const clamp01: (n: number) => number;
