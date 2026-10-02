import type { Provider } from "@prisma/client";
import { config } from "./config";
import { addDays, startOfUtcDay } from "./dates";
import { db } from "./db";
import { assignRanks } from "./ranking";

interface UserTotals {
  userId: string;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  providers: Provider[];
}

function windowStartFor(now: Date) {
  return startOfUtcDay(addDays(now, -config.windowDays));
}

/** Aggregates every user's usage in the window, ranks them, and stores an immutable snapshot. */
export async function buildSnapshot(now = new Date()) {
  const windowStart = windowStartFor(now);

  const totals = await db.$queryRaw<UserTotals[]>`
    SELECT c."userId"                         AS "userId",
           SUM(u."inputTokens")::bigint       AS "inputTokens",
           SUM(u."outputTokens")::bigint      AS "outputTokens",
           SUM(u."totalTokens")::bigint       AS "totalTokens",
           ARRAY_AGG(DISTINCT c."provider"::text) AS "providers"
    FROM "UsageDaily" u
    JOIN "Connection" c ON c."id" = u."connectionId"
    WHERE u."date" >= ${windowStart}
    GROUP BY c."userId"
    HAVING SUM(u."totalTokens") > 0
    ORDER BY "totalTokens" DESC, MIN(c."createdAt") ASC`;

  const topModels = await db.$queryRaw<Array<{ userId: string; model: string }>>`
    SELECT DISTINCT ON (c."userId") c."userId" AS "userId", u."model" AS "model"
    FROM "UsageDaily" u
    JOIN "Connection" c ON c."id" = u."connectionId"
    WHERE u."date" >= ${windowStart}
    GROUP BY c."userId", u."model"
    ORDER BY c."userId", SUM(u."totalTokens") DESC`;
  const topModelByUser = new Map(topModels.map((r) => [r.userId, r.model]));

  const previous = await db.leaderboardSnapshot.findFirst({ orderBy: { generatedAt: "desc" }, select: { id: true } });
  const prevRanks = new Map(
    previous
      ? (
          await db.leaderboardEntry.findMany({
            where: { snapshotId: previous.id },
            select: { userId: true, rank: true },
          })
        ).map((e) => [e.userId, e.rank])
      : [],
  );

  const ranked = assignRanks(totals);
  const grandTotal = ranked.reduce((sum, r) => sum + r.totalTokens, 0n);

  const snapshot = await db.$transaction(async (tx) => {
    const snap = await tx.leaderboardSnapshot.create({
      data: { generatedAt: now, windowStart, windowEnd: now, userCount: ranked.length, totalTokens: grandTotal },
    });
    for (let i = 0; i < ranked.length; i += 1000) {
      await tx.leaderboardEntry.createMany({
        data: ranked.slice(i, i + 1000).map((r) => ({
          snapshotId: snap.id,
          userId: r.userId,
          rank: r.rank,
          prevRank: prevRanks.get(r.userId) ?? null,
          totalTokens: r.totalTokens,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          providers: r.providers,
          topModel: topModelByUser.get(r.userId) ?? null,
        })),
      });
    }
    return snap;
  }, { timeout: 60_000 });

  const stale = await db.leaderboardSnapshot.findMany({
    orderBy: { generatedAt: "desc" },
    skip: config.snapshotsToKeep,
    select: { id: true },
  });
  if (stale.length) await db.leaderboardSnapshot.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });

  return snapshot;
}

export async function getLatestLeaderboard(limit = config.pageSize) {
  const snapshot = await db.leaderboardSnapshot.findFirst({ orderBy: { generatedAt: "desc" } });
  if (!snapshot) return null;
  const entries = await db.leaderboardEntry.findMany({
    where: { snapshotId: snapshot.id },
    orderBy: [{ rank: "asc" }, { totalTokens: "desc" }],
    take: limit,
    include: { user: { select: { name: true, handle: true, image: true } } },
  });
  return { snapshot, entries };
}

export type Standing =
  | { kind: "ranked"; rank: number; prevRank: number | null; totalTokens: bigint; outOf: number }
  | { kind: "provisional"; rank: number; totalTokens: bigint; outOf: number }
  | { kind: "unranked"; hasConnections: boolean };

/**
 * Official rank from the latest snapshot; if the user connected after it was built,
 * a provisional rank against that snapshot so they see where they'll land.
 */
export async function getStanding(userId: string, snapshotId: string | null, now = new Date()): Promise<Standing> {
  if (snapshotId) {
    const entry = await db.leaderboardEntry.findUnique({ where: { snapshotId_userId: { snapshotId, userId } } });
    if (entry) {
      const outOf = await db.leaderboardEntry.count({ where: { snapshotId } });
      return { kind: "ranked", rank: entry.rank, prevRank: entry.prevRank, totalTokens: entry.totalTokens, outOf };
    }
  }

  const hasConnections = (await db.connection.count({ where: { userId } })) > 0;
  if (!hasConnections) return { kind: "unranked", hasConnections };

  const agg = await db.usageDaily.aggregate({
    where: { connection: { userId }, date: { gte: windowStartFor(now) } },
    _sum: { totalTokens: true },
  });
  const totalTokens = agg._sum.totalTokens ?? 0n;
  if (totalTokens === 0n) return { kind: "unranked", hasConnections };

  if (!snapshotId) return { kind: "provisional", rank: 1, totalTokens, outOf: 1 };
  const [ahead, outOf] = await Promise.all([
    db.leaderboardEntry.count({ where: { snapshotId, totalTokens: { gt: totalTokens } } }),
    db.leaderboardEntry.count({ where: { snapshotId } }),
  ]);
  return { kind: "provisional", rank: ahead + 1, totalTokens, outOf: outOf + 1 };
}
