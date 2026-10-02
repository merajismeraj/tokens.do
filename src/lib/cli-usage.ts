import { config } from "./config";
import { fingerprint } from "./crypto";
import { addDays, isoDay, startOfUtcDay } from "./dates";
import { db } from "./db";
import { isCliProvider, type CliProvider } from "./sources";

export interface CliDay {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export class UsageValidationError extends Error {}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 5000;

function nonNegInt(v: unknown, field: string): bigint {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
    throw new UsageValidationError(`${field} must be a non-negative integer`);
  }
  return BigInt(v);
}

/**
 * Checks a CLI upload and returns rows ready to store. Rejects anything outside the backfill window,
 * future-dated, or above the per-day cap — self-reported data gets bounds, not trust.
 */
export function validateCliUpload(body: unknown, now = new Date()) {
  const b = body as { provider?: unknown; days?: unknown };
  if (typeof b?.provider !== "string" || !isCliProvider(b.provider)) {
    throw new UsageValidationError("provider must be claude_code or codex");
  }
  if (!Array.isArray(b.days) || b.days.length > MAX_ROWS) {
    throw new UsageValidationError(`days must be an array of at most ${MAX_ROWS} rows`);
  }
  const earliest = isoDay(startOfUtcDay(addDays(now, -config.backfillDays)));
  const latest = isoDay(addDays(now, 1)); // local midnight can be ahead of UTC

  const perDay = new Map<string, bigint>();
  const rows = b.days.map((raw, i) => {
    const d = raw as Partial<CliDay>;
    if (typeof d?.date !== "string" || !DAY_RE.test(d.date)) throw new UsageValidationError(`days[${i}].date must be YYYY-MM-DD`);
    if (d.date < earliest || d.date > latest) throw new UsageValidationError(`days[${i}].date is outside ${earliest}..${latest}`);
    const model = typeof d.model === "string" && d.model.trim() ? d.model.trim().slice(0, 120) : "unknown";
    const inputTokens = nonNegInt(d.inputTokens, `days[${i}].inputTokens`);
    const outputTokens = nonNegInt(d.outputTokens, `days[${i}].outputTokens`);
    const cachedTokens = nonNegInt(d.cachedTokens ?? 0, `days[${i}].cachedTokens`);
    if (cachedTokens > inputTokens) throw new UsageValidationError(`days[${i}].cachedTokens exceeds inputTokens`);
    const total = inputTokens + outputTokens;
    perDay.set(d.date, (perDay.get(d.date) ?? 0n) + total);
    return { date: d.date, model, inputTokens, outputTokens, cachedTokens, totalTokens: total };
  });

  for (const [date, total] of perDay) {
    if (total > config.cliDailyCap) {
      throw new UsageValidationError(`${date}: ${total} tokens exceeds the ${config.cliDailyCap} per-day cap`);
    }
  }

  // Collapse duplicate (date, model) rows so the composite key can't collide.
  const merged = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.date}|${r.model}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, { ...r });
    else {
      prev.inputTokens += r.inputTokens;
      prev.outputTokens += r.outputTokens;
      prev.cachedTokens += r.cachedTokens;
      prev.totalTokens += r.totalTokens;
    }
  }
  return { provider: b.provider as CliProvider, rows: [...merged.values()] };
}

/**
 * Stores a device's upload. Only the dates present in the upload are replaced, so a day whose
 * local logs were pruned (Claude Code deletes old logs) keeps what was uploaded before.
 */
export async function ingestCliUsage(
  device: { id: string; name: string; userId: string },
  upload: ReturnType<typeof validateCliUpload>,
  now = new Date(),
) {
  const orgFingerprint = fingerprint(`cli:${device.id}:${upload.provider}`);
  const conn = await db.connection.upsert({
    where: { provider_orgFingerprint: { provider: upload.provider, orgFingerprint } },
    create: { userId: device.userId, provider: upload.provider, keyHint: device.name, orgFingerprint, deviceId: device.id },
    update: {},
  });
  const dates = [...new Set(upload.rows.map((r) => r.date))].map((d) => new Date(`${d}T00:00:00Z`));
  await db.$transaction([
    db.usageDaily.deleteMany({ where: { connectionId: conn.id, date: { in: dates } } }),
    db.usageDaily.createMany({
      data: upload.rows.map((r) => ({ ...r, connectionId: conn.id, date: new Date(`${r.date}T00:00:00Z`) })),
    }),
    db.connection.update({ where: { id: conn.id }, data: { lastSyncedAt: now, lastError: null, keyHint: device.name } }),
  ]);
  return { days: dates.length, totalTokens: upload.rows.reduce((s, r) => s + r.totalTokens, 0n) };
}
