import { readCredentials } from "./claude-accounts.js";
import { remainingFromWindows } from "./claude-usage.js";
const SWITCH_LABEL = "Switch Claude Code account";
/**
 * Moves the running `opencode-claude-auth` plugin to another Claude login through its own
 * "Switch Claude Code account" auth method. It keeps its active account in memory per process.
 */
export class ClaudeSwitcher {
    client;
    active = null;
    chain = Promise.resolve();
    constructor(client) {
        this.client = client;
    }
    /**
     * Method indexes to try. Listing the methods is the precise way, but opencode answers that call with
     * an error while two or more Claude logins exist (the switch menu has an option without a hint), so
     * fall back to the first few indexes: the switch method is the plugin's only one and comes first.
     */
    async candidateMethods() {
        try {
            const methods = (await this.client.provider.auth()).data?.anthropic ?? [];
            const method = methods.findIndex((m) => m.type === "oauth" && m.label === SWITCH_LABEL);
            if (method >= 0)
                return [method];
        }
        catch {
            // listing unavailable: probe below
        }
        return [0, 1, 2, 3];
    }
    switchTo(service) {
        const run = async () => {
            if (this.active === service)
                return;
            for (const method of await this.candidateMethods()) {
                const auth = await this.client.provider.oauth
                    .authorize({ path: { id: "anthropic" }, body: { method, inputs: { account: service } } })
                    .catch(() => ({ error: true }));
                // The reply names the Keychain entry it activated: only accept the one we asked for.
                if (auth.error || !auth.data?.instructions?.includes(`(${service})`))
                    continue;
                await this.client.provider.oauth.callback({ path: { id: "anthropic" }, body: { method } }).catch(() => undefined);
                this.active = service;
                return;
            }
            throw new Error('could not switch the Claude account (opencode-claude-auth\'s "Switch Claude Code account" method did not confirm it)');
        };
        const next = this.chain.then(run, run);
        this.chain = next.catch(() => undefined);
        return next;
    }
}
export class ClaudeOAuthSource {
    spec;
    account;
    switcher;
    usage;
    model;
    constructor(spec, account, switcher, usage) {
        this.spec = spec;
        this.account = account;
        this.switcher = switcher;
        this.usage = usage;
        this.model = { providerID: "anthropic", modelID: spec.modelID };
    }
    async remaining() {
        if (!this.account)
            return null;
        const result = await this.usage.get(this.account);
        return "windows" in result ? remainingFromWindows(result.windows) : null;
    }
    async prepare() {
        if (!this.account)
            throw new Error(`no Claude login matches "${this.spec.account}"`);
        if (!(await readCredentials(this.account)))
            throw new Error(`Claude login "${this.spec.account}" has no stored credentials (run claude once with it)`);
        await this.switcher.switchTo(this.account.service);
    }
    describe() {
        return this.account ? `Claude OAuth ${this.account.email ?? this.account.service}` : `Claude OAuth "${this.spec.account}" (login not found)`;
    }
}
