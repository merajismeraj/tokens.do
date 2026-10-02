import { timingSafeEqual } from "node:crypto";
import { buildSnapshot } from "@/lib/leaderboard";
import { syncAll } from "@/lib/sync";
import { pruneVisitors } from "@/lib/visits";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Daily job (vercel.json): pull fresh usage for every connection, then re-rank everyone. */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const started = Date.now();
  const results = await syncAll();
  const snapshot = await buildSnapshot();
  await pruneVisitors().catch(() => undefined);

  return Response.json({
    snapshotId: snapshot.id,
    rankedUsers: snapshot.userCount,
    totalTokens: snapshot.totalTokens.toString(),
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).map((r) => ({ id: r.connectionId, error: r.error })),
    ms: Date.now() - started,
  });
}
