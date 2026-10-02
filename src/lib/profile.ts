import type { Provider } from "@prisma/client";
import { db } from "./db";
import { getStanding, type Standing } from "./leaderboard";

/** X usernames: 1–15 letters, digits or underscores. Anything else can't be a profile. */
export const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

export interface Profile {
  user: { id: string; name: string | null; handle: string; image: string | null };
  standing: Standing;
  providers: Provider[];
  topModel: string | null;
}

/** Public profile for a handle (case-insensitive, like X). Null if no such user. */
export async function getProfile(handle: string): Promise<Profile | null> {
  if (!HANDLE_RE.test(handle)) return null;
  const user = await db.user.findFirst({
    where: { handle: { equals: handle, mode: "insensitive" } },
    select: { id: true, name: true, handle: true, image: true },
  });
  if (!user?.handle) return null;

  const snapshot = await db.leaderboardSnapshot.findFirst({ orderBy: { generatedAt: "desc" }, select: { id: true } });
  const [standing, entry] = await Promise.all([
    getStanding(user.id, snapshot?.id ?? null),
    snapshot
      ? db.leaderboardEntry.findUnique({
          where: { snapshotId_userId: { snapshotId: snapshot.id, userId: user.id } },
          select: { providers: true, topModel: true },
        })
      : null,
  ]);
  return {
    user: { ...user, handle: user.handle },
    standing,
    providers: entry?.providers ?? [],
    topModel: entry?.topModel ?? null,
  };
}
