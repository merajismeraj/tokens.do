# tokens.do

Global leaderboard of the biggest LLM token spenders.

1. **Sign in with X**: your handle and avatar show on the board.
2. **Connect models**: add one or more OpenAI or Anthropic orgs with an admin (usage-read) key.
3. **Get ranked**: usage is pulled daily and everyone is re-ranked at 00:00 UTC.

## How it works

| Piece | Where |
| --- | --- |
| X OAuth 2.0 (Auth.js v5, Prisma adapter, DB sessions) | `src/auth.ts` |
| Provider adapters (OpenAI Usage API, Anthropic Usage & Cost API) | `src/lib/providers/*` |
| Daily usage sync, one row per day per model | `src/lib/sync.ts` → `UsageDaily` |
| Ranking snapshot (competition ranking, rank movement, top model) | `src/lib/leaderboard.ts` |
| 24h refresh: sync all keys, then build a snapshot | `src/app/api/cron/refresh/route.ts`, `vercel.json` |

**Ranking metric:** total tokens over a trailing `LEADERBOARD_WINDOW_DAYS` (default 30). Total means input (including cache reads and writes) plus output. A rolling window keeps the board competitive. An all-time board stops moving and favors whoever joined first.

**Between refreshes:** a user who connects mid-day sees a *projected* rank against the latest snapshot. It becomes official at the next refresh.

**Anti-gaming:** only one account can claim each provider org, so the same org can't be counted twice. Orgs are matched by an HMAC fingerprint of the Anthropic org id or the OpenAI default-project id.

**Key security:** keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY` and are never sent to the client. Only the last 4 characters are displayed. Ask users for read-only admin keys where the provider supports them.

## Setup

```bash
cp .env.example .env      # fill in values
npm install
npm run db:push           # create tables
npm run dev
```

In the X developer portal, enable OAuth 2.0 with type "Web App" and set the callback to `https://<domain>/api/auth/callback/twitter`.

Trigger a refresh manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/refresh
```

## Tests

```bash
npm test                                            # unit tests
TEST_DATABASE_URL=postgres://… npm test             # + end-to-end pipeline against a scratch DB
```

## Adding a provider

1. Implement `ProviderAdapter` (`identify` and `fetchDailyUsage`) in `src/lib/providers/`.
2. Register it in `index.ts`.
3. Add its id to the `Provider` enum in `prisma/schema.prisma`.
