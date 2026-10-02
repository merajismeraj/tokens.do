import { anthropic } from "./anthropic";
import { openai } from "./openai";
import type { ProviderAdapter, ProviderId } from "./types";

export const providers: Record<ProviderId, ProviderAdapter> = { openai, anthropic };

export const providerList = Object.values(providers);

export function getProvider(id: string): ProviderAdapter | undefined {
  return (providers as Record<string, ProviderAdapter>)[id];
}

export * from "./types";
