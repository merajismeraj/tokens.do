import { ProviderAuthError, ProviderError, type DailyUsage } from "./types";

const MAX_ATTEMPTS = 4;

export async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401 || res.status === 403) throw new ProviderAuthError();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(`${res.status} from ${new URL(url).host}: ${body.slice(0, 200)}`, res.status);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 10_000)));
  }
}

/** Merge rows that share (date, model) — pages can split a bucket. */
export function mergeUsage(rows: DailyUsage[]): DailyUsage[] {
  const byKey = new Map<string, DailyUsage>();
  for (const r of rows) {
    const key = `${r.date}|${r.model}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...r });
    else {
      prev.inputTokens += r.inputTokens;
      prev.outputTokens += r.outputTokens;
      prev.cachedTokens += r.cachedTokens;
    }
  }
  return [...byKey.values()].filter((r) => r.inputTokens + r.outputTokens > 0n);
}

export const big = (n: number | null | undefined): bigint => BigInt(Math.max(0, Math.trunc(n ?? 0)));
