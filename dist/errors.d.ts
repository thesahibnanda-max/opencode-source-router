export type FailureKind = "rate-limit" | "overloaded" | "quota" | "auth";
export interface Failure {
    kind: FailureKind;
    /** Server-provided wait, when a Retry-After header was present. */
    retryAfterMs?: number;
}
/**
 * Turn the `error` of a `session.error` event into a failure worth failing over for.
 * Returns undefined for errors that are not the source's fault (aborts, context overflow, ...).
 */
export declare function classifyError(error: unknown): Failure | undefined;
/** How long to skip a source after a failure. */
export declare function cooldownFor(failure: Failure, baseMs: number): number;
