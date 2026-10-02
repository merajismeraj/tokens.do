import { db } from "@/lib/db";
import { newCliToken, sha256 } from "@/lib/cli-auth";
import { clientIp, enforce, LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Step 2: the CLI polls until the user approves in the browser, then receives its token exactly once. */
export async function POST(req: Request) {
  const limited = await enforce(`token:${clientIp(req)}`, LIMITS.tokenPoll);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { device_code?: unknown };
  if (typeof body.device_code !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });

  const deviceCodeHash = sha256(body.device_code);
  const pending = await db.deviceAuth.findUnique({ where: { deviceCodeHash } });
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await db.deviceAuth.delete({ where: { deviceCodeHash } });
    return Response.json({ error: "expired_token" }, { status: 400 });
  }
  if (!pending.userId) return Response.json({ error: "authorization_pending" }, { status: 400 });

  const token = newCliToken();
  // Delete-then-create in one transaction: a replayed device code can't mint a second token.
  const [, device] = await db.$transaction([
    db.deviceAuth.delete({ where: { deviceCodeHash } }),
    db.cliDevice.create({ data: { userId: pending.userId, name: pending.deviceName, tokenHash: sha256(token) } }),
  ]);
  const user = await db.user.findUnique({ where: { id: device.userId }, select: { handle: true } });
  return Response.json({ token, handle: user?.handle ?? null, device: device.name });
}
