import { authenticateDevice } from "@/lib/cli-auth";
import { enforce, LIMITS } from "@/lib/rate-limit";
import { ingestCliUsage, UsageValidationError, validateCliUpload } from "@/lib/cli-usage";

export const dynamic = "force-dynamic";

/** Daily per-model totals from the CLI. Counts only — no prompts or code are ever sent. */
export async function POST(req: Request) {
  const device = await authenticateDevice(req);
  if (!device) return Response.json({ error: "unauthorized" }, { status: 401 });
  const limited = await enforce(`usage:${device.id}`, LIMITS.usageUpload);
  if (limited) return limited;

  let upload;
  try {
    upload = validateCliUpload(await req.json());
  } catch (err) {
    const message = err instanceof UsageValidationError ? err.message : "Body must be JSON";
    return Response.json({ error: message }, { status: 400 });
  }

  const result = await ingestCliUsage(device, upload);
  return Response.json({ ok: true, provider: upload.provider, days: result.days, totalTokens: result.totalTokens.toString() });
}
