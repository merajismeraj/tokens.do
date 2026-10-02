import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM module shipped in the CLI package
import { readClaudeCode, readCodex } from "../cli/lib/readers.mjs";

let dir: string;
const jsonl = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tokens-cli-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readClaudeCode", () => {
  it("dedupes repeated message lines, sums cache tokens, skips synthetic", async () => {
    const root = join(dir, "claude", "projects");
    await mkdir(join(root, "proj-a"), { recursive: true });
    const usage = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 };
    await writeFile(
      join(root, "proj-a", "s1.jsonl"),
      jsonl([
        { type: "user", timestamp: "2026-09-10T10:00:00Z", message: { role: "user", content: "secret prompt" } },
        // same response logged once per content block, first copy with partial output
        { type: "assistant", requestId: "req_1", timestamp: "2026-09-10T10:00:01Z", message: { id: "msg_1", model: "claude-opus-4", usage: { ...usage, output_tokens: 5 } } },
        { type: "assistant", requestId: "req_1", timestamp: "2026-09-10T10:00:02Z", message: { id: "msg_1", model: "claude-opus-4", usage } },
        { type: "assistant", requestId: "req_2", timestamp: "2026-09-10T23:59:00Z", message: { id: "msg_2", model: "claude-opus-4", usage } },
        { type: "assistant", timestamp: "2026-09-10T10:00:03Z", message: { id: "msg_x", model: "<synthetic>", usage } },
        { type: "assistant", requestId: "req_3", timestamp: "2026-09-11T00:00:01Z", message: { id: "msg_3", model: "claude-sonnet-4", usage } },
        { type: "assistant", requestId: "req_old", timestamp: "2026-08-01T00:00:00Z", message: { id: "msg_old", model: "claude-opus-4", usage } },
      ]) + "{not json",
    );
    // a resumed session copies earlier messages into a new file
    await writeFile(
      join(root, "proj-a", "s2.jsonl"),
      jsonl([{ type: "assistant", requestId: "req_1", timestamp: "2026-09-10T10:00:02Z", message: { id: "msg_1", model: "claude-opus-4", usage } }]),
    );

    const rows = await readClaudeCode({ roots: [root, join(dir, "missing")], since: "2026-09-01" });
    expect(rows).toEqual([
      { date: "2026-09-10", model: "claude-opus-4", inputTokens: 2220, outputTokens: 100, cachedTokens: 2000 },
      { date: "2026-09-11", model: "claude-sonnet-4", inputTokens: 1110, outputTokens: 50, cachedTokens: 1000 },
    ]);
    expect(JSON.stringify(rows)).not.toContain("secret");
  });

  it("skips files last modified before the window", async () => {
    const root = join(dir, "claude-old", "projects");
    await mkdir(root, { recursive: true });
    const file = join(root, "old.jsonl");
    await writeFile(
      file,
      jsonl([{ requestId: "r", timestamp: "2026-09-10T00:00:00Z", message: { id: "m", model: "x", usage: { input_tokens: 1, output_tokens: 1 } } }]),
    );
    await utimes(file, new Date("2026-01-01"), new Date("2026-01-01"));
    expect(await readClaudeCode({ roots: [root], since: "2026-09-01" })).toEqual([]);
  });
});

describe("readCodex", () => {
  const tc = (ts: string, input: number, cached: number, output: number) => ({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output },
        last_token_usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 },
      },
    },
  });

  it("counts only increases in the cumulative total, across re-emissions and restarts", async () => {
    const root = join(dir, "codex", "sessions", "2026", "09", "10");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "rollout-a.jsonl"),
      jsonl([
        { timestamp: "2026-09-10T09:00:00Z", type: "session_meta", payload: { id: "s", cwd: "/secret/path" } },
        { timestamp: "2026-09-10T09:00:00Z", type: "turn_context", payload: { model: "gpt-5-codex" } },
        { timestamp: "2026-09-10T09:00:01Z", type: "event_msg", payload: { type: "token_count", info: null } },
        tc("2026-09-10T09:00:02Z", 1000, 400, 100),
        tc("2026-09-10T09:00:03Z", 1000, 400, 100), // re-emitted, no change
        tc("2026-09-10T09:00:04Z", 3000, 1400, 300),
        { timestamp: "2026-09-10T09:01:00Z", type: "turn_context", payload: { model: "gpt-5" } },
        tc("2026-09-11T01:00:00Z", 3500, 1400, 350),
        tc("2026-09-11T02:00:00Z", 200, 0, 20), // counter restarted
      ]),
    );
    const rows = await readCodex({ roots: [join(dir, "codex", "sessions")], since: "2026-09-01" });
    expect(rows).toEqual([
      { date: "2026-09-10", model: "gpt-5-codex", inputTokens: 3000, outputTokens: 300, cachedTokens: 1400 },
      { date: "2026-09-11", model: "gpt-5", inputTokens: 700, outputTokens: 70, cachedTokens: 0 },
    ]);
    expect(JSON.stringify(rows)).not.toContain("secret");
  });

  it("uses the last snapshot per turn for per-turn cumulative logs", async () => {
    const root = join(dir, "codex2", "sessions");
    await mkdir(root, { recursive: true });
    const snap = (turn: string, ts: string, input: number, output: number) => ({
      timestamp: ts,
      type: "event_msg",
      payload: { type: "token_usage_record", turn_id: turn, turn_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: output } },
    });
    await writeFile(
      join(root, "rollout-b.jsonl"),
      jsonl([
        { timestamp: "2026-09-12T00:00:00Z", type: "turn_context", payload: { model: "gpt-5" } },
        snap("t1", "2026-09-12T00:00:01Z", 34_823, 10),
        snap("t1", "2026-09-12T00:00:11Z", 70_313, 20),
        snap("t1", "2026-09-12T00:00:21Z", 117_411, 30),
        snap("t2", "2026-09-12T00:01:00Z", 5000, 5),
      ]),
    );
    expect(await readCodex({ roots: [root], since: "2026-09-01" })).toEqual([
      { date: "2026-09-12", model: "gpt-5", inputTokens: 122_411, outputTokens: 35, cachedTokens: 0 },
    ]);
  });
});
