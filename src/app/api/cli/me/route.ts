import { authenticateDevice } from "@/lib/cli-auth";
import { db } from "@/lib/db";
import { getStanding } from "@/lib/leaderboard";
import { enforce, LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return Response.json({ error: "unauthorized" }, { status: 401 });
  const limited = await enforce(`me:${device.id}`, LIMITS.me);
  if (limited) return limited;

  const snapshot = await db.leaderboardSnapshot.findFirst({ orderBy: { generatedAt: "desc" }, select: { id: true } });
  const standing = await getStanding(device.userId, snapshot?.id ?? null);
  return Response.json({
    handle: device.user.handle,
    device: device.name,
    standing:
      standing.kind === "unranked"
        ? { kind: standing.kind }
        : { kind: standing.kind, rank: standing.rank, outOf: standing.outOf, totalTokens: standing.totalTokens.toString() },
  });
}
