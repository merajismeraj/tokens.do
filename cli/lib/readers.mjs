// Readers for local agent logs. They return daily per-model token totals and nothing else:
// prompts, code and file paths never leave this module.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

/** @typedef {{ date: string, model: string, inputTokens: number, outputTokens: number, cachedTokens: number }} DayRow */

async function* jsonlFiles(dir, sinceMs) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // missing dir = tool not installed
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(path, sinceMs);
    else if (e.isFile() && e.name.endsWith(".jsonl")) {
      // A file untouched since the window opened can't contain usage inside it.
      if ((await stat(path)).mtimeMs >= sinceMs) yield path;
    }
  }
}

async function* jsonLines(path) {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line || line[0] !== "{") continue;
    try {
      yield JSON.parse(line);
    } catch {
      // partial line from a session still being written
    }
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0);
const utcDay = (ts) => (typeof ts === "string" && ts.length >= 10 ? new Date(ts).toISOString().slice(0, 10) : null);

class DayTotals {
  constructor(since) {
    this.since = since;
    this.map = new Map();
  }
  add(date, model, input, output, cached) {
    if (!date || date < this.since || input + output === 0) return;
    const key = `${date}|${model}`;
    const row = this.map.get(key) ?? { date, model, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    row.inputTokens += input;
    row.outputTokens += output;
    row.cachedTokens += cached;
    this.map.set(key, row);
  }
  /** @returns {DayRow[]} */
  rows() {
    return [...this.map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));
  }
}

export function claudeCodeRoots(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR) return env.CLAUDE_CONFIG_DIR.split(",").map((d) => join(d.trim(), "projects"));
  return [join(homedir(), ".config", "claude", "projects"), join(homedir(), ".claude", "projects")];
}

/**
 * Claude Code writes one JSON line per message event under ~/.claude/projects/<project>/<session>.jsonl.
 * The same API response can be logged on several lines (one per content block, and again when a
 * session is resumed), so usage is de-duplicated by message.id + requestId before summing.
 * @param {{ roots?: string[], since: string }} opts since = YYYY-MM-DD (UTC)
 */
export async function readClaudeCode({ roots = claudeCodeRoots(), since }) {
  const sinceMs = Date.parse(`${since}T00:00:00Z`);
  const seen = new Map(); // id -> {date, model, usage}
  let anon = 0;
  for (const root of roots) {
    for await (const file of jsonlFiles(root, sinceMs)) {
      for await (const e of jsonLines(file)) {
        const msg = e?.message;
        const u = msg?.usage;
        if (!u || typeof msg.model !== "string" || msg.model === "<synthetic>") continue;
        const date = utcDay(e.timestamp);
        if (!date) continue;
        const id = msg.id && e.requestId ? `${msg.id}:${e.requestId}` : msg.id ? String(msg.id) : `anon:${anon++}`;
        const prev = seen.get(id);
        // Keep the most complete copy: streamed duplicates can carry partial output counts.
        if (!prev || num(u.output_tokens) > num(prev.usage.output_tokens)) seen.set(id, { date, model: msg.model, usage: u });
      }
    }
  }
  const totals = new DayTotals(since);
  for (const { date, model, usage: u } of seen.values()) {
    const cacheRead = num(u.cache_read_input_tokens);
    totals.add(date, model, num(u.input_tokens) + num(u.cache_creation_input_tokens) + cacheRead, num(u.output_tokens), cacheRead);
  }
  return totals.rows();
}

export function codexRoots(env = process.env) {
  const home = env.CODEX_HOME || join(homedir(), ".codex");
  return [join(home, "sessions"), join(home, "archived_sessions")];
}

const FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens"];

function usageObj(u) {
  return u && typeof u === "object" ? Object.fromEntries(FIELDS.map((f) => [f, num(u[f])])) : null;
}

/**
 * Codex writes ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Token events are cumulative snapshots
 * that get re-emitted, so summing them over-counts badly. Instead:
 *  - `token_count` events: count only the increase in `info.total_token_usage` (session-cumulative);
 *    an unchanged total is a re-emission, a smaller one means the counter restarted.
 *  - newer `turn_token_usage` snapshots (cumulative per turn): keep the last snapshot of each turn.
 * The second form is used only for files that have no `total_token_usage` at all, so nothing is counted twice.
 * Codex's input_tokens already include cached input, and output_tokens include reasoning.
 * @param {{ roots?: string[], since: string }} opts
 */
export async function readCodex({ roots = codexRoots(), since }) {
  const sinceMs = Date.parse(`${since}T00:00:00Z`);
  const totals = new DayTotals(since);
  for (const root of roots) {
    for await (const file of jsonlFiles(root, sinceMs)) {
      let model = "unknown";
      let prev = null;
      let sawCumulative = false;
      const turns = new Map(); // turnId -> {date, model, usage}
      for await (const e of jsonLines(file)) {
        const p = e?.payload;
        if (!p || typeof p !== "object") continue;
        if (typeof p.model === "string" && p.model) model = p.model;

        const total = usageObj(p.info?.total_token_usage);
        if (p.type === "token_count" && total) {
          sawCumulative = true;
          const date = utcDay(e.timestamp);
          const restarted = prev && FIELDS.some((f) => total[f] < prev[f]);
          const delta = Object.fromEntries(FIELDS.map((f) => [f, !prev || restarted ? total[f] : total[f] - prev[f]]));
          prev = total;
          totals.add(date, model, delta.input_tokens, delta.output_tokens, Math.min(delta.cached_input_tokens, delta.input_tokens));
          continue;
        }

        const turn = usageObj(p.turn_token_usage);
        const turnId = p.turn_id ?? p.turnId;
        if (turn && turnId != null) turns.set(String(turnId), { date: utcDay(e.timestamp), model, usage: turn });
      }
      if (!sawCumulative) {
        for (const t of turns.values()) {
          totals.add(t.date, t.model, t.usage.input_tokens, t.usage.output_tokens, Math.min(t.usage.cached_input_tokens, t.usage.input_tokens));
        }
      }
    }
  }
  return totals.rows();
}
