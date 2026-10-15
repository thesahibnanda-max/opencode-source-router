import { execFile } from "node:child_process"

/** Caches an async value for `ttlMs`; concurrent callers share one in-flight call. */
export class TtlCache<T> {
  private value: { at: number; data: T } | undefined
  private inflight: Promise<T> | undefined

  constructor(private ttlMs: number) {}

  async get(load: () => Promise<T>, now = Date.now()): Promise<T> {
    if (this.value && now - this.value.at < this.ttlMs) return this.value.data
    this.inflight ??= load()
      .then((data) => {
        this.value = { at: Date.now(), data }
        return data
      })
      .finally(() => {
        this.inflight = undefined
      })
    return this.inflight
  }
}

export function exec(file: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  })
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
