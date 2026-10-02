import type { Provider } from "@prisma/client";

/**
 * How usage reaches us, and therefore how much to trust it.
 * - key: read from the provider's admin/usage API (verified)
 * - openrouter: read from OpenRouter's activity API (verified)
 * - cli: uploaded by `npx tokens.do` from local Claude Code / Codex logs (self-reported)
 */
export type SourceMethod = "key" | "openrouter" | "cli";

export const METHOD_BADGE: Record<SourceMethod, { label: string; title: string }> = {
  key: { label: "KEY", title: "Verified: read from the provider's admin API" },
  openrouter: { label: "OR", title: "Verified: read from OpenRouter's activity API" },
  cli: { label: "CLI", title: "Self-reported: uploaded from local Claude Code / Codex logs" },
};

export const SOURCES: Record<Provider, { name: string; method: SourceMethod }> = {
  openai: { name: "OpenAI", method: "key" },
  anthropic: { name: "Anthropic", method: "key" },
  openrouter: { name: "OpenRouter", method: "openrouter" },
  claude_code: { name: "Claude Code", method: "cli" },
  codex: { name: "Codex", method: "cli" },
};

export const CLI_PROVIDERS = ["claude_code", "codex"] as const satisfies readonly Provider[];
export type CliProvider = (typeof CLI_PROVIDERS)[number];

export function isCliProvider(p: string): p is CliProvider {
  return (CLI_PROVIDERS as readonly string[]).includes(p);
}
