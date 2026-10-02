function intEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const windowDays = intEnv("LEADERBOARD_WINDOW_DAYS", 30);

export const config = {
  /** Leaderboard ranks on trailing N days so new and old users compete fairly. */
  windowDays,
  /** How far back to pull usage the first time a key is connected. */
  backfillDays: Math.max(intEnv("USAGE_BACKFILL_DAYS", 30), windowDays),
  /** Providers finalize recent buckets late; re-pull this many days on every sync. */
  resyncDays: 2,
  pageSize: 100,
  maxConnectionsPerUser: 10,
  snapshotsToKeep: 30,
  syncConcurrency: 4,
};
