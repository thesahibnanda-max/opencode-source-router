/** Remembers which sources are skipped, and until when. */
export class Cooldowns {
    until = new Map();
    set(key, untilMs) {
        this.until.set(key, untilMs);
    }
    isCooling(key, now = Date.now()) {
        const t = this.until.get(key);
        return t !== undefined && t > now;
    }
    remainingMs(key, now = Date.now()) {
        return Math.max(0, (this.until.get(key) ?? 0) - now);
    }
    clear(key) {
        if (key === undefined)
            this.until.clear();
        else
            this.until.delete(key);
    }
}
const score = (c, o) => c.remaining ?? o.unknownScore;
/**
 * Pick the candidate with the most quota left. Ties go to the earlier entry (config order).
 * The current source is kept unless another is ahead by at least `switchMargin`, so a
 * conversation does not bounce between providers over tiny differences.
 * `candidates` must already exclude sources in cooldown.
 */
export function choose(candidates, current, opts) {
    if (candidates.length === 0)
        return null;
    let best = candidates[0];
    for (const c of candidates)
        if (score(c, opts) > score(best, opts))
            best = c;
    const cur = current === null ? undefined : candidates.find((c) => c.key === current);
    if (cur && score(cur, opts) + opts.switchMargin >= score(best, opts))
        return cur.key;
    return best.key;
}
