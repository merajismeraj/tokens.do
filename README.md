# tokens.do

Global leaderboard of the biggest LLM token spenders.

1. **Sign in with X**: your handle and avatar show on the board.
2. **Connect usage**, any mix of:
   - `npx tokens.do`: reads local Claude Code / Codex logs. No keys needed, and it works for Max, Pro and Plus subscriptions. Badge: **CLI** (self-reported).
   - an OpenAI or Anthropic admin key. Badge: **KEY** (verified).
   - an OpenRouter Management key. Badge: **OR** (verified).
3. **Get ranked**: usage is pulled daily and everyone is re-ranked at 00:00 UTC.

## How it works

| Piece | Where |
| --- | --- |
| X OAuth 2.0 (Auth.js v5, Prisma adapter, DB sessions) | `src/auth.ts` |
| Key adapters (OpenAI Usage API, Anthropic Usage & Cost API, OpenRouter Activity API) | `src/lib/providers/*` |
| Source badges (KEY / OR / CLI) | `src/lib/sources.ts`, `src/components/SourceChip.tsx` |
| CLI package (`npx tokens.do`): log readers, device login, upload | `cli/` |
| CLI server side: device login, token auth, upload checks | `src/app/api/cli/*`, `src/app/cli`, `src/lib/cli-*.ts` |
| Daily usage sync, one row per day per model | `src/lib/sync.ts` → `UsageDaily` |
| Ranking snapshot (competition ranking, rank movement, top model) | `src/lib/leaderboard.ts` |
| 24h refresh: sync all keys, then build a snapshot | `src/app/api/cron/refresh/route.ts`, `vercel.json` |

**Ranking metric:** total tokens over a trailing `LEADERBOARD_WINDOW_DAYS` (default 30). Total means input (including cache reads and writes) plus output. A rolling window keeps the board competitive. An all-time board stops moving and favors whoever joined first.

**Between refreshes:** a user who connects mid-day sees a *projected* rank against the latest snapshot. It becomes official at the next refresh.

**CLI uploads** are self-reported, so they are bounded rather than trusted:
- Rows must fall inside the backfill window.
- Each device, source and day is capped at `CLI_DAILY_TOKEN_CAP` tokens.
- Every machine gets its own token, so several machines add up.
- A re-sync replaces only the days it sends, so pruned local logs never erase history.
- Revoking a device deletes its uploads.

**Codex logs** repeat cumulative snapshots, so the reader counts only increases in the session total. **Claude Code logs** repeat the same response on several lines, so the reader keeps one copy per message id and request id. Summing raw lines over-counted a real session 2.4×.

**Anti-gaming:** only one account can claim each provider org, so the same org can't be counted twice. Orgs are matched by an HMAC fingerprint of the Anthropic org id or the OpenAI default-project id.

**Key security:** keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY` and are never sent to the client. Only the last 4 characters are displayed. Ask users for read-only admin keys where the provider supports them.

## Setup

```bash
cp .env.example .env      # fill in values
npm install
npm run db:migrate        # apply migrations
npm run dev
```

In the X developer portal, enable OAuth 2.0 with type "Web App" and set the callback to `https://<domain>/api/auth/callback/twitter`.

Trigger a refresh manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/refresh
```

## Database changes

Migrations live in `prisma/migrations` and are applied automatically on every Vercel build (`scripts/vercel-build.sh` runs `prisma migrate deploy`). After editing `prisma/schema.prisma`, create one with:

```bash
npm run db:migration -- <name>
```

On Vercel the Neon integration supplies `<prefix>_DATABASE_URL` (pooled, used at runtime) and `<prefix>_DATABASE_URL_UNPOOLED` (direct, used for migrations); the prefix is detected automatically. Locally, plain `DATABASE_URL` works. Builds refuse any database containing tables or migrations that aren't tokens.do's (`scripts/db-guard.mjs`).

## Tests

```bash
npm test                                            # unit tests
TEST_DATABASE_URL=postgres://… npm test             # + end-to-end pipeline against a scratch DB
```

## Rate limits

Counters live in Postgres (`RateLimit`), not memory, so they hold across serverless instances. They're defined in `src/lib/rate-limit.ts`:

| Endpoint | Limit |
| --- | --- |
| `POST /api/cli/device` (new login code) | 10 / 10 min per IP |
| `POST /api/cli/token` (CLI polling) | 120 / min per IP |
| `POST /api/cli/usage` | 60 / hour per device |
| `GET /api/cli/me` | 120 / hour per device |
| Approving a code at `/cli` | 20 / 10 min per user |

## Publishing the CLI

```bash
cd cli && npm publish   # package name: tokens.do
```

Point it at another server with `TOKENS_DO_URL=https://staging.example npx tokens.do`.

## Adding a provider

1. Implement `ProviderAdapter` (`identify` and `fetchDailyUsage`) in `src/lib/providers/`.
2. Register it in `index.ts`.
3. Add its id to the `Provider` enum in `prisma/schema.prisma`.
