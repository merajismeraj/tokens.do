# tokens.do CLI

```bash
npx tokens.do            # sign in with X (first run), then upload
npx tokens.do --dry-run  # print exactly what would be sent
```

Reads token counts from local logs and uploads **daily totals per model**. It never sends prompts, code or file paths.

| Tool | Logs read |
| --- | --- |
| Claude Code | `~/.claude/projects/**/*.jsonl`, `~/.config/claude/projects/**/*.jsonl`, or `$CLAUDE_CONFIG_DIR` |
| Codex | `~/.codex/sessions/**/*.jsonl` and `archived_sessions/`, or `$CODEX_HOME` |

Usage from the CLI is shown with a **CLI** (self-reported) badge on the board.

To stay ranked, run it daily, e.g. with cron: `0 23 * * * npx -y tokens.do sync`.

The token is stored in `~/.config/tokens.do/config.json` (mode 600). Revoking the device at tokens.do/connect deletes its uploads.
