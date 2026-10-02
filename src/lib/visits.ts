import { fingerprint } from "./crypto";
import { addDays, isoDay, startOfUtcDay } from "./dates";
import { db } from "./db";

/** Crawlers, link unfurlers and scripts. Most never run the beacon anyway; this catches headless ones. */
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|curl|wget|python|http-?client|axios|node-fetch/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

/** Counts a visitor once per UTC day. Returns true if this was their first visit today. */
export async function recordVisit(ip: string, userAgent: string | null, now = new Date()): Promise<boolean> {
  if (isBot(userAgent)) return false;
  const day = startOfUtcDay(now);
  const hash = fingerprint(`visit:${isoDay(day)}:${ip}:${userAgent}`);
  // One statement: the counter only moves when the visitor row is new, so retries and races can't double count.
  const counted = await db.$executeRaw`
    WITH ins AS (
      INSERT INTO "Visitor" ("day", "hash") VALUES (${day}::date, ${hash}) ON CONFLICT DO NOTHING RETURNING 1
    )
    INSERT INTO "VisitDaily" ("day", "count") SELECT ${day}::date, 1 FROM ins
    ON CONFLICT ("day") DO UPDATE SET "count" = "VisitDaily"."count" + 1`;
  return counted > 0;
}

export async function getVisitStats(now = new Date()): Promise<{ total: number; today: number }> {
  const [sum, today] = await Promise.all([
    db.visitDaily.aggregate({ _sum: { count: true } }),
    db.visitDaily.findUnique({ where: { day: startOfUtcDay(now) } }),
  ]);
  return { total: sum._sum.count ?? 0, today: today?.count ?? 0 };
}

/** Visitor hashes are only needed for today's dedupe; yesterday is kept for clock skew around midnight. */
export async function pruneVisitors(now = new Date()) {
  return db.visitor.deleteMany({ where: { day: { lt: addDays(startOfUtcDay(now), -1) } } });
}
