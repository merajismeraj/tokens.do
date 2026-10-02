import { startOfUtcDay } from "../dates";
import { big, getJson, mergeUsage } from "./http";
import type { DailyUsage, ProviderAdapter } from "./types";

const BASE = "https://api.openai.com/v1/organization";

interface Page<T> {
  data: T[];
  has_more: boolean;
  next_page?: string | null;
  last_id?: string | null;
}

interface Project {
  id: string;
  created_at: number;
}

interface UsageBucket {
  start_time: number;
  results: Array<{
    model?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    input_cached_tokens?: number;
  }>;
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}` });

export const openai: ProviderAdapter = {
  id: "openai",
  name: "OpenAI",
  keyPrefix: "sk-admin-",
  keyHelp: "Needs a read-only Admin key.",
  keyHelpUrl: "https://platform.openai.com/settings/organization/admin-keys",

  // OpenAI has no "who am I" endpoint for admin keys. The org's oldest project
  // (its Default project) has a globally unique id that never changes, so it
  // serves as the org identity.
  async identify(apiKey) {
    let oldest: Project | undefined;
    let after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const qs = new URLSearchParams({ limit: "100", include_archived: "true" });
      if (after) qs.set("after", after);
      const page = await getJson<Page<Project>>(`${BASE}/projects?${qs}`, headers(apiKey));
      for (const p of page.data) if (!oldest || p.created_at < oldest.created_at) oldest = p;
      if (!page.has_more || !page.last_id) break;
      after = page.last_id;
    }
    if (!oldest) throw new Error("No projects found for this OpenAI organization");
    return { orgId: oldest.id };
  },

  async fetchDailyUsage(apiKey, start, end) {
    const rows: DailyUsage[] = [];
    let cursor: string | undefined;
    do {
      const qs = new URLSearchParams({
        start_time: String(Math.floor(startOfUtcDay(start).getTime() / 1000)),
        end_time: String(Math.floor(end.getTime() / 1000)),
        bucket_width: "1d",
        group_by: "model",
        limit: "31",
      });
      if (cursor) qs.set("page", cursor);
      const page = await getJson<Page<UsageBucket>>(`${BASE}/usage/completions?${qs}`, headers(apiKey));
      for (const bucket of page.data) {
        const date = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
        for (const r of bucket.results) {
          rows.push({
            date,
            model: r.model || "unknown",
            inputTokens: big(r.input_tokens), // already includes cached input
            outputTokens: big(r.output_tokens),
            cachedTokens: big(r.input_cached_tokens),
          });
        }
      }
      cursor = page.has_more ? (page.next_page ?? undefined) : undefined;
    } while (cursor);
    return mergeUsage(rows);
  },
};
