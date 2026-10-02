const DAY_MS = 86_400_000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The cron fires at 00:00 UTC daily (see vercel.json). */
export function nextRefreshAt(now = new Date()): Date {
  return addDays(startOfUtcDay(now), 1);
}
