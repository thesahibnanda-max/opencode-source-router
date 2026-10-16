import type { RouterOptions } from "./config.js";
import { Cooldowns } from "./router.js";
import type { ModelRef, Source } from "./types.js";
/** What is needed to re-send the last user message on another model. */
export interface ReplayPart {
    type: "text" | "file";
    [field: string]: unknown;
}
export interface Retry {
    model: ModelRef;
    key: string;
    parts: ReplayPart[];
}
export declare class Controller {
    readonly sources: Source[];
    private options;
    private log;
    private now;
    readonly cooldowns: Cooldowns;
    private sessions;
    constructor(sources: Source[], options: Pick<RouterOptions, "cooldownMinutes" | "switchMargin" | "unknownScore">, log?: (level: "info" | "warn", message: string) => void, now?: () => number);
    private session;
    /** Called for each new user message. Returns the model to use, or undefined to leave it alone. */
    route(sessionID: string, userModel: ModelRef | undefined, parts: ReplayPart[]): Promise<ModelRef | undefined>;
    /** Pick and prepare the best source. A source that cannot be prepared is skipped for a while. */
    private pick;
    /** Called for `session.error`. Returns a retry to send, or undefined when nothing should be done. */
    onError(sessionID: string, error: unknown): Promise<Retry | undefined>;
    /** The retry could not be sent: allow the next real message to be routed normally. */
    retryFailed(sessionID: string): void;
    /** `/fix-model [source]`. Returns a message for the user. */
    fix(sessionID: string, ref?: string): string;
    auto(sessionID: string): string;
    status(sessionID: string): Promise<string>;
}
