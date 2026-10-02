import { db } from "@/lib/db";
import { DEVICE_CODE_TTL_MS, newDeviceCode, newUserCode, POLL_INTERVAL_S, sha256 } from "@/lib/cli-auth";

export const dynamic = "force-dynamic";

/** Step 1 of `tokens.do login`: hand the CLI a device code to poll with and a user code to show. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { deviceName?: unknown };
  const deviceName = typeof body.deviceName === "string" && body.deviceName.trim() ? body.deviceName.trim().slice(0, 60) : "cli";

  await db.deviceAuth.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const deviceCode = newDeviceCode();
  let userCode = newUserCode();
  for (let i = 0; i < 5 && (await db.deviceAuth.findUnique({ where: { userCode } })); i++) userCode = newUserCode();

  await db.deviceAuth.create({
    data: { deviceCodeHash: sha256(deviceCode), userCode, deviceName, expiresAt: new Date(Date.now() + DEVICE_CODE_TTL_MS) },
  });

  const origin = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : new URL(req.url).origin;
  return Response.json({
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${origin}/cli`,
    verification_uri_complete: `${origin}/cli?code=${encodeURIComponent(userCode)}`,
    interval: POLL_INTERVAL_S,
    expires_in: DEVICE_CODE_TTL_MS / 1000,
  });
}
