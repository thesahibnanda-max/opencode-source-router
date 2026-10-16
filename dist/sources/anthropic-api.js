/** Claude API key account. Has no quota percentage, so it is chosen by order and by errors only. */
export class AnthropicApiSource {
    spec;
    envVar;
    env;
    model;
    providerID;
    constructor(spec, envVar, env = process.env) {
        this.spec = spec;
        this.envVar = envVar;
        this.env = env;
        this.providerID = `source-router-anthropic-${(spec.account ?? "api").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        this.model = { providerID: this.providerID, modelID: spec.modelID };
    }
    key() {
        const v = this.envVar ? this.env[this.envVar] : undefined;
        return v && v.trim() ? v.trim() : undefined;
    }
    remaining() {
        return Promise.resolve(null);
    }
    async prepare() {
        if (!this.envVar)
            throw new Error(`no env var configured for "${this.spec.key}" (add it under "auth")`);
        if (!this.key())
            throw new Error(`environment variable ${this.envVar} is empty or not set`);
    }
    provider() {
        const apiKey = this.key();
        if (!apiKey)
            return undefined;
        return {
            id: this.providerID,
            config: {
                npm: "@ai-sdk/anthropic",
                name: `Source Router: ${this.spec.account}`,
                options: { apiKey },
                models: { [this.spec.modelID]: { name: this.spec.modelID, id: this.spec.modelID } },
            },
        };
    }
    describe() {
        return `Claude API key (${this.envVar ?? "no env var"})`;
    }
}
