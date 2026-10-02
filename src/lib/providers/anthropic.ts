import { startOfUtcDay } from "../dates";
import { big, getJson, mergeUsage } from "./http";
import type { DailyUsage, ProviderAdapter } from "./types";

const BASE = "https://api.anthropic.com/v1/organizations";

interface UsageReport {
  data: Array<{
    starting_at: string;
    results: Array<{
      model?: string | null;
      uncached_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } | null;
      output_tokens?: number;
    }>;
  }>;
  has_more: boolean;
  next_page?: string | null;
}

const headers = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" });

export const anthropic: ProviderAdapter = {
  id: "anthropic",
  name: "Anthropic",
  keyPrefix: "sk-ant-admin",
  keyHelp: "Create an Admin API key in the Claude Console under Settings → Admin keys.",
  keyHelpUrl: "https://console.anthropic.com/settings/admin-keys",

  async identify(apiKey) {
    const org = await getJson<{ id: string; name?: string }>(`${BASE}/me`, headers(apiKey));
    return { orgId: org.id, orgName: org.name };
  },

  async fetchDailyUsage(apiKey, start, end) {
    const rows: DailyUsage[] = [];
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({
        starting_at: startOfUtcDay(start).toISOString(),
        ending_at: end.toISOString(),
        bucket_width: "1d",
        limit: "31",
      });
      qs.append("group_by[]", "model");
      if (cursor) qs.set("page", cursor);
      const page = await getJson<UsageReport>(`${BASE}/usage_report/messages?${qs}`, headers(apiKey));
      for (const bucket of page.data) {
        const date = bucket.starting_at.slice(0, 10);
        for (const r of bucket.results) {
          const cacheWrite =
            (r.cache_creation?.ephemeral_1h_input_tokens ?? 0) + (r.cache_creation?.ephemeral_5m_input_tokens ?? 0);
          rows.push({
            date,
            model: r.model || "unknown",
            inputTokens: big(r.uncached_input_tokens) + big(cacheWrite) + big(r.cache_read_input_tokens),
            outputTokens: big(r.output_tokens),
            cachedTokens: big(r.cache_read_input_tokens),
          });
        }
      }
      cursor = page.has_more ? (page.next_page ?? undefined) : undefined;
    } while (cursor);
    return mergeUsage(rows);
  },
};
