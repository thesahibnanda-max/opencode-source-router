import type { Source, SourceSpec } from "../types.js";
/** Claude API key account. Has no quota percentage, so it is chosen by order and by errors only. */
export declare class AnthropicApiSource implements Source {
    readonly spec: SourceSpec;
    private envVar;
    private env;
    readonly model: {
        providerID: string;
        modelID: string;
    };
    private providerID;
    constructor(spec: SourceSpec, envVar: string | undefined, env?: NodeJS.ProcessEnv);
    private key;
    remaining(): Promise<number | null>;
    prepare(): Promise<void>;
    provider(): {
        id: string;
        config: {
            npm: string;
            name: string;
            options: {
                apiKey: string;
            };
            models: {
                [x: string]: {
                    name: string;
                    id: string;
                };
            };
        };
    } | undefined;
    describe(): string;
}
