import { createHash } from "node:crypto";
import { isoDay } from "../dates";
import { big, getJson, mergeUsage } from "./http";
import type { DailyUsage, ProviderAdapter } from "./types";

const BASE = "https://openrouter.ai/api/v1";

interface Activity {
  data: Array<{
    date: string;
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    reasoning_tokens?: number;
  }>;
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}` });

export const openrouter: ProviderAdapter = {
  id: "openrouter",
  name: "OpenRouter",
  keyPrefix: "sk-or-",
  keyHelp: "Needs a Management key. Regular OpenRouter keys can't read token activity.",
  keyHelpUrl: "https://openrouter.ai/settings/management-keys",

  // OpenRouter exposes no account id to a management key, so the key itself is the identity.
  // One OpenRouter connection per user is enforced in the connect action.
  async identify(apiKey) {
    await getJson<Activity>(`${BASE}/activity`, headers(apiKey));
    return { orgId: `key:${createHash("sha256").update(apiKey).digest("hex")}` };
  },

  // /activity returns the last 30 completed UTC days, one row per day per model endpoint.
  async fetchDailyUsage(apiKey, start, end) {
    const res = await getJson<Activity>(`${BASE}/activity`, headers(apiKey));
    const from = isoDay(start);
    const to = isoDay(end);
    const rows: DailyUsage[] = res.data
      .map((r) => ({
        date: r.date.slice(0, 10),
        model: r.model || "unknown",
        inputTokens: big(r.prompt_tokens),
        outputTokens: big(r.completion_tokens),
        cachedTokens: 0n,
      }))
      .filter((r) => r.date >= from && r.date <= to);
    return mergeUsage(rows);
  },
};
