import { db } from "./db";

export interface Limit {
  /** Max requests per window. */
  limit: number;
  windowSec: number;
}

/** Limits for unauthenticated or token-authenticated CLI endpoints. */
export const LIMITS = {
  deviceStart: { limit: 10, windowSec: 600 }, // per IP: new login codes
  tokenPoll: { limit: 120, windowSec: 60 }, // per IP: the CLI polls every 3s
  usageUpload: { limit: 60, windowSec: 3600 }, // per device
  me: { limit: 120, windowSec: 3600 }, // per device
  approve: { limit: 20, windowSec: 600 }, // per user: code entry attempts
} satisfies Record<string, Limit>;

/** Atomically counts this request in the current window. Returns how long to wait if over the limit. */
export async function hit(key: string, { limit, windowSec }: Limit, now = Date.now()) {
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"`;

  // Cheap garbage collection, roughly once per hundred requests.
  if (Math.random() < 0.01) {
    await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now - 86_400_000) } } }).catch(() => undefined);
  }

  const ok = row.count <= limit;
  return { ok, retryAfter: ok ? 0 : Math.ceil((windowStart.getTime() + windowMs - now) / 1000) };
}

/** First hop in x-forwarded-for is the client on Vercel; falls back for local dev. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "rate_limited", retry_after: retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/** Returns a 429 response when over the limit, otherwise null. */
export async function enforce(key: string, limit: Limit): Promise<Response | null> {
  const { ok, retryAfter } = await hit(key, limit);
  return ok ? null : tooManyRequests(retryAfter);
}
