export interface ModelRef {
  providerID: string
  modelID: string
}

export type SourceKind = "claude-oauth" | "claude-api" | "openai" | "google"

export interface SourceSpec {
  /** The key exactly as written in the `models` option, e.g. `anthropic@work`. */
  key: string
  kind: SourceKind
  /** Account / name part after `@`, when the kind needs one. */
  account?: string
  modelID: string
}

/** Minimal slice of the opencode SDK client the plugin needs (kept loose on purpose). */
export interface PluginClient {
  provider: {
    auth(): Promise<{ data?: Record<string, Array<{ type: string; label: string }>> }>
    oauth: {
      authorize(opts: { path: { id: string }; body: Record<string, unknown> }): Promise<{ data?: { instructions?: string }; error?: unknown }>
      callback(opts: { path: { id: string }; body: Record<string, unknown> }): Promise<{ error?: unknown }>
    }
  }
  session: {
    promptAsync(opts: { path: { id: string }; body: Record<string, unknown> }): Promise<{ error?: unknown }>
  }
  app?: { log(opts: { body: { service: string; level: string; message: string } }): Promise<unknown> }
}

export interface Source {
  spec: SourceSpec
  model: ModelRef
  /** Fraction of quota left in 0..1, or null when there is no usable usage check. */
  remaining(): Promise<number | null>
  /** Make this source live for the next request (e.g. switch the Claude account). */
  prepare(): Promise<void>
  /** Short human description for `/sources`. */
  describe(): string
  /** Extra opencode provider this source needs, injected through the `config` hook. */
  provider?(): { id: string; config: Record<string, unknown> } | undefined
}
