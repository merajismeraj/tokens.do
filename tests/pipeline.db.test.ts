/**
 * End-to-end: connect → sync (mocked provider) → snapshot → standings, against a real Postgres.
 * Runs only when TEST_DATABASE_URL points at a disposable database (schema applied via `prisma db push`).
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("pipeline (db)", () => {
  let mod: {
    db: typeof import("@/lib/db").db;
    syncConnection: typeof import("@/lib/sync").syncConnection;
    lb: typeof import("@/lib/leaderboard");
    encryptSecret: typeof import("@/lib/crypto").encryptSecret;
  };
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
    mod = {
      db: (await import("@/lib/db")).db,
      syncConnection: (await import("@/lib/sync")).syncConnection,
      lb: await import("@/lib/leaderboard"),
      encryptSecret: (await import("@/lib/crypto")).encryptSecret,
    };
    const { db } = mod;
    await db.leaderboardSnapshot.deleteMany();
    await db.user.deleteMany();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mod?.db.$disconnect();
  });

  async function seedUser(handle: string, provider: "openai" | "anthropic", tokens: Array<[string, number, number]>) {
    const { db, encryptSecret, syncConnection } = mod;
    const user = await db.user.create({ data: { handle, name: handle } });
    const conn = await db.connection.create({
      data: {
        userId: user.id,
        provider,
        encryptedKey: encryptSecret(`key-${handle}`),
        keyHint: "test",
        orgFingerprint: `fp-${handle}-${provider}`,
      },
    });
    const body =
      provider === "openai"
        ? {
            data: [
              {
                start_time: Math.floor(Date.parse(`${today}T00:00:00Z`) / 1000),
                results: tokens.map(([model, i, o]) => ({ model, input_tokens: i, output_tokens: o })),
              },
            ],
            has_more: false,
          }
        : {
            data: [
              {
                starting_at: `${today}T00:00:00Z`,
                results: tokens.map(([model, i, o]) => ({ model, uncached_input_tokens: i, output_tokens: o })),
              },
            ],
            has_more: false,
          };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    const res = await syncConnection(conn, now);
    expect(res.ok).toBe(true);
    return user;
  }

  it("ranks users across providers, tracks movement and projected ranks", async () => {
    const { lb, db } = mod;
    const alice = await seedUser("alice", "openai", [["gpt-5", 1000, 500], ["gpt-5-mini", 10, 10]]);
    await seedUser("alice2", "anthropic", [["claude-opus", 100, 100]]);
    const bob = await seedUser("bob", "anthropic", [["claude-opus", 5000, 1000]]);
    await seedUser("carol", "openai", [["gpt-5", 1000, 500]]); // ties alice

    // A second org for alice is summed into one rank.
    const secondConn = await db.connection.create({
      data: { userId: alice.id, provider: "anthropic", encryptedKey: mod.encryptSecret("k"), keyHint: "x", orgFingerprint: "fp-alice-2" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ starting_at: `${today}T00:00:00Z`, results: [{ model: "claude-sonnet", uncached_input_tokens: 15, output_tokens: 5 }] }],
            has_more: false,
          }),
        ),
      ),
    );
    await mod.syncConnection(secondConn, now);

    const snap1 = await lb.buildSnapshot(now);
    const board1 = (await lb.getLatestLeaderboard())!;
    expect(board1.snapshot.id).toBe(snap1.id);
    expect(board1.entries.map((e) => [e.user.handle, e.rank, Number(e.totalTokens)])).toEqual([
      ["bob", 1, 6000],
      ["alice", 2, 1540],
      ["carol", 3, 1500],
      ["alice2", 4, 200],
    ]);
    const aliceEntry = board1.entries.find((e) => e.user.handle === "alice")!;
    expect(aliceEntry.topModel).toBe("gpt-5");
    expect([...aliceEntry.providers].sort()).toEqual(["anthropic", "openai"]);
    expect(aliceEntry.prevRank).toBeNull();

    // Newcomer after the snapshot gets a projected rank.
    const dave = await seedUser("dave", "openai", [["gpt-5", 3000, 0]]);
    expect(await lb.getStanding(dave.id, snap1.id, now)).toMatchObject({ kind: "provisional", rank: 2, outOf: 5 });

    // Next day's refresh: dave becomes official, others move.
    await lb.buildSnapshot(new Date(now.getTime() + 1000));
    const board2 = (await lb.getLatestLeaderboard())!;
    const byHandle = new Map(board2.entries.map((e) => [e.user.handle, e]));
    expect(byHandle.get("dave")).toMatchObject({ rank: 2, prevRank: null });
    expect(byHandle.get("alice")).toMatchObject({ rank: 3, prevRank: 2 });
    expect(await lb.getStanding(bob.id, board2.snapshot.id, now)).toMatchObject({ kind: "ranked", rank: 1, prevRank: 1, outOf: 5 });

    const nobody = await db.user.create({ data: { handle: "nobody" } });
    expect(await lb.getStanding(nobody.id, board2.snapshot.id, now)).toEqual({ kind: "unranked", hasConnections: false });
  });
});
