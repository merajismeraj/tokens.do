import type { Connection } from "@prisma/client";
import { config } from "./config";
import { decryptSecret } from "./crypto";
import { addDays, startOfUtcDay } from "./dates";
import { db } from "./db";
import { getProvider, ProviderAuthError } from "./providers";

export interface SyncResult {
  connectionId: string;
  ok: boolean;
  rows: number;
  error?: string;
}

/** Pulls daily usage for one connection and replaces the re-synced date range. */
export async function syncConnection(conn: Connection, now = new Date()): Promise<SyncResult> {
  const adapter = getProvider(conn.provider);
  if (!adapter || !conn.encryptedKey) {
    return { connectionId: conn.id, ok: false, rows: 0, error: `${conn.provider} is not a pull source` };
  }
  const encryptedKey = conn.encryptedKey;

  const floor = startOfUtcDay(addDays(now, -config.backfillDays));
  const from = conn.lastSyncedAt
    ? new Date(Math.max(floor.getTime(), startOfUtcDay(addDays(conn.lastSyncedAt, -config.resyncDays)).getTime()))
    : floor;

  try {
    const usage = await adapter.fetchDailyUsage(decryptSecret(encryptedKey), from, now);
    await db.$transaction([
      db.usageDaily.deleteMany({ where: { connectionId: conn.id, date: { gte: from } } }),
      db.usageDaily.createMany({
        data: usage.map((u) => ({
          connectionId: conn.id,
          date: new Date(`${u.date}T00:00:00Z`),
          model: u.model,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cachedTokens: u.cachedTokens,
          totalTokens: u.inputTokens + u.outputTokens,
        })),
      }),
      db.connection.update({
        where: { id: conn.id },
        data: { lastSyncedAt: now, status: "active", lastError: null },
      }),
    ]);
    return { connectionId: conn.id, ok: true, rows: usage.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.connection.update({
      where: { id: conn.id },
      data: {
        lastError: message.slice(0, 500),
        ...(err instanceof ProviderAuthError ? { status: "invalid" as const } : {}),
      },
    });
    return { connectionId: conn.id, ok: false, rows: 0, error: message };
  }
}

export async function syncAll(now = new Date()): Promise<SyncResult[]> {
  // CLI connections have no key: devices push their own usage via /api/cli/usage.
  const queue = await db.connection.findMany({
    where: { status: "active", encryptedKey: { not: null } },
    orderBy: { lastSyncedAt: "asc" },
  });
  const results: SyncResult[] = [];
  const workers = Array.from({ length: config.syncConcurrency }, async () => {
    for (let conn = queue.shift(); conn; conn = queue.shift()) {
      results.push(await syncConnection(conn, now));
    }
  });
  await Promise.all(workers);
  return results;
}
