export declare const DEFAULT_SERVICE = "Claude Code-credentials";
export interface ClaudeAccount {
    /** Keychain service name holding this login. */
    service: string;
    /** Claude config dir (used for the credentials-file fallback off macOS). */
    configDir: string;
    email?: string;
    /** claude-swap slot number, when claude-swap manages this account. */
    num?: string;
    alias?: string;
}
export declare const hashedService: (configDir: string) => string;
/**
 * Find Claude Code logins on this machine. claude-swap profiles come first (they carry slot numbers
 * and aliases); every other login is found from the plain Keychain entry and `~/.<dir>/.claude.json`.
 */
export declare function discoverAccounts(home?: string, env?: NodeJS.ProcessEnv): ClaudeAccount[];
/** Match a reference from the config: slot number, alias, email, or the start of an email. */
export declare function resolveAccount(accounts: ClaudeAccount[], ref: string): ClaudeAccount | undefined;
export interface ClaudeCredentials {
    accessToken: string;
    expiresAt: number;
}
export declare function readCredentials(account: ClaudeAccount): Promise<ClaudeCredentials | undefined>;
