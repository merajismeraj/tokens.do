/** Providers we pull from with a stored key. CLI sources push instead (see src/lib/sources.ts). */
export type ProviderId = "openai" | "anthropic" | "openrouter";

export interface DailyUsage {
  /** UTC day, YYYY-MM-DD */
  date: string;
  model: string;
  inputTokens: bigint;
  outputTokens: bigint;
  /** Subset of inputTokens that were cache reads. */
  cachedTokens: bigint;
}

export interface OrgIdentity {
  /** Stable, provider-unique org identifier. Used to stop one org being claimed twice. */
  orgId: string;
  orgName?: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  name: string;
  /** Admin/usage keys only — regular inference keys can't read org usage. */
  keyPrefix: string;
  keyHelp: string;
  keyHelpUrl: string;
  /** Validates the key and returns the org it belongs to. Throws ProviderAuthError on a bad key. */
  identify(apiKey: string): Promise<OrgIdentity>;
  /** Daily usage per model for [start, end). */
  fetchDailyUsage(apiKey: string, start: Date, end: Date): Promise<DailyUsage[]>;
}

export class ProviderAuthError extends Error {
  constructor(message = "The provider rejected this key") {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
