#!/usr/bin/env node
// tokens.do CLI: reads token counts from local Claude Code and Codex logs and uploads daily totals.
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, hostname, platform } from "node:os";
import { dirname, join } from "node:path";
import { readClaudeCode, readCodex } from "../lib/readers.mjs";

const SERVER = (process.env.TOKENS_DO_URL || "https://tokens.do").replace(/\/$/, "");
const CONFIG = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tokens.do", "config.json");
const DEFAULT_DAYS = 30;

const c = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, lime: (s) => `\x1b[38;5;154m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m` }
  : { dim: String, bold: String, lime: String, red: String };

const HELP = `${c.bold("tokens.do")} — get ranked on the token leaderboard

  npx tokens.do              sign in (first run) and sync
  npx tokens.do login        link this machine to your X account
  npx tokens.do sync         upload the last ${DEFAULT_DAYS} days
      --days <n>             how many days back (max 30)
      --dry-run              print exactly what would be sent, send nothing
  npx tokens.do status       show your rank
  npx tokens.do logout       forget this machine's token

Sends daily token counts per model. Never prompts, code or file paths.
Run it daily (cron / launchd) to keep your rank current.`;

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

async function saveConfig(cfg) {
  await mkdir(dirname(CONFIG), { recursive: true });
  await writeFile(CONFIG, JSON.stringify(cfg, null, 2));
  await chmod(CONFIG, 0o600);
}

async function api(path, { token, body, method = body ? "POST" : "GET" } = {}) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function openBrowser(url) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // no browser available; the URL is printed anyway
  }
}

async function login() {
  const { status, data } = await api("/api/cli/device", { body: { deviceName: hostname() } });
  if (status === 429) throw new Error(`Too many login attempts. Try again in ${data.retry_after}s.`);
  if (status !== 200) throw new Error(`Couldn't start login (${status})`);

  console.log(`\n  Your code: ${c.lime(c.bold(data.user_code))}`);
  console.log(`  Approve at ${c.bold(data.verification_uri_complete)}\n`);
  openBrowser(data.verification_uri_complete);

  const deadline = Date.now() + data.expires_in * 1000;
  process.stdout.write(c.dim("  waiting for approval"));
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, data.interval * 1000));
    const res = await api("/api/cli/token", { body: { device_code: data.device_code } });
    if (res.status === 200) {
      await saveConfig({ ...(await loadConfig()), token: res.data.token, handle: res.data.handle, server: SERVER });
      console.log(`\n  ${c.lime("✓")} Linked ${c.bold(res.data.device)} to @${res.data.handle}\n`);
      return res.data.token;
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, (res.data.retry_after ?? 5) * 1000));
      continue;
    }
    if (res.data.error !== "authorization_pending") break;
    process.stdout.write(c.dim("."));
  }
  throw new Error("Login expired. Run `npx tokens.do login` again.");
}

function parseDays(args) {
  const i = args.indexOf("--days");
  const n = i >= 0 ? Number.parseInt(args[i + 1], 10) : DEFAULT_DAYS;
  return Math.min(Math.max(Number.isFinite(n) ? n : DEFAULT_DAYS, 1), 30);
}

const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

async function sync(args) {
  const dryRun = args.includes("--dry-run");
  const days = parseDays(args);
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const sources = [
    { provider: "claude_code", name: "Claude Code", rows: await readClaudeCode({ since }) },
    { provider: "codex", name: "Codex", rows: await readCodex({ since }) },
  ];
  for (const s of sources) {
    const total = s.rows.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
    const days = new Set(s.rows.map((r) => r.date)).size;
    console.log(`  ${s.name.padEnd(12)} ${s.rows.length ? `${c.bold(fmt(total).padStart(8))}  ${c.dim(`${days} days`)}` : c.dim("no logs found")}`);
  }
  const toSend = sources.filter((s) => s.rows.length);

  if (dryRun) {
    console.log(c.dim("\n  --dry-run: this is the complete payload; nothing was sent\n"));
    console.log(JSON.stringify(toSend.map(({ provider, rows }) => ({ provider, days: rows })), null, 2));
    return;
  }
  if (!toSend.length) {
    console.log(c.dim("\n  Nothing to upload. Is Claude Code or Codex installed on this machine?\n"));
    return;
  }

  let { token } = await loadConfig();
  if (!token) token = await login();

  for (const s of toSend) {
    const res = await api("/api/cli/usage", { token, body: { provider: s.provider, days: s.rows } });
    if (res.status === 401) throw new Error("This machine's token was revoked. Run `npx tokens.do login`.");
    if (res.status === 429) throw new Error(`Rate limited. Try again in ${res.data.retry_after}s.`);
    if (res.status !== 200) throw new Error(`${s.name} upload failed: ${res.data.error ?? res.status}`);
  }
  console.log(`\n  ${c.lime("✓")} Synced.`);
  await status(token);
}

async function status(token) {
  token ??= (await loadConfig()).token;
  if (!token) return console.log("  Not logged in. Run `npx tokens.do login`.");
  const { status: code, data } = await api("/api/cli/me", { token });
  if (code !== 200) return console.log(c.red("  Token rejected. Run `npx tokens.do login`."));
  const s = data.standing;
  if (s.kind === "unranked") console.log(`  @${data.handle}: not ranked yet.`);
  else {
    const label = s.kind === "ranked" ? "rank" : "projected rank (official at 00:00 UTC)";
    console.log(`  @${data.handle}: ${c.lime(c.bold(`#${s.rank}`))} of ${s.outOf} · ${fmt(Number(s.totalTokens))} tokens · ${label}`);
    // Same text and URL as src/lib/share.ts.
    const text = encodeURIComponent(`I'm world #${s.rank.toLocaleString("en-US")} token maxxer!`);
    console.log(`\n  Share it: ${c.bold(`https://x.com/intent/post?text=${text}&url=${encodeURIComponent("https://tokens.do")}`)}`);
  }
  console.log(c.dim(`  ${SERVER}\n`));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case undefined:
    case "sync":
      return sync(cmd ? args : []);
    case "login":
      return void (await login());
    case "status":
      return status();
    case "logout":
      await rm(CONFIG, { force: true });
      return console.log("  Logged out. Revoke the device at tokens.do/connect to delete its uploads.");
    case "-h":
    case "--help":
    case "help":
      return console.log(HELP);
    default:
      if (cmd.startsWith("--")) return sync([cmd, ...args]);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(c.red(`\n  ${err.message}\n`));
  process.exitCode = 1;
});
