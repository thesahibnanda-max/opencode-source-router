export interface Candidate {
    key: string;
    /** Fraction left in 0..1, or null when unknown. */
    remaining: number | null;
}
export interface ChooseOptions {
    unknownScore: number;
    switchMargin: number;
}
/** Remembers which sources are skipped, and until when. */
export declare class Cooldowns {
    private until;
    set(key: string, untilMs: number): void;
    isCooling(key: string, now?: number): boolean;
    remainingMs(key: string, now?: number): number;
    clear(key?: string): void;
}
/**
 * Pick the candidate with the most quota left. Ties go to the earlier entry (config order).
 * The current source is kept unless another is ahead by at least `switchMargin`, so a
 * conversation does not bounce between providers over tiny differences.
 * `candidates` must already exclude sources in cooldown.
 */
export declare function choose(candidates: Candidate[], current: string | null, opts: ChooseOptions): string | null;
