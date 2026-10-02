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
  /** Upper bound on self-reported tokens per device, source and day. Heavy agent users with cache reads can pass 1B/day. */
  cliDailyCap: BigInt(intEnv("CLI_DAILY_TOKEN_CAP", 20_000_000_000)),
};
