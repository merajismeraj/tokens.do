import { clientIp, enforce, LIMITS } from "@/lib/rate-limit";
import { recordVisit } from "@/lib/visits";

export const dynamic = "force-dynamic";

/** Beacon from <VisitBeacon />. Counts unique visitors per day; always 204 so it never surfaces errors. */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = await enforce(`visit:${ip}`, LIMITS.visit);
  if (limited) return limited;
  await recordVisit(ip, req.headers.get("user-agent")).catch(() => false);
  return new Response(null, { status: 204 });
}
