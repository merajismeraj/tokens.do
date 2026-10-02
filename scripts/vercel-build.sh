#!/bin/sh
# Vercel build: generate the client, apply pending migrations, build.
set -e
# The Neon integration's variable prefix depends on how the store was connected; resolve it.
DATABASE_URL="$(node scripts/db-url.mjs DATABASE_URL)" || { echo "No Postgres DATABASE_URL (or *_DATABASE_URL) found." >&2; exit 1; }
export DATABASE_URL
# Migrations take advisory locks, which need a direct (unpooled) connection.
MIGRATE_URL="$(node scripts/db-url.mjs DATABASE_URL_UNPOOLED || printf '%s' "$DATABASE_URL")"

npx prisma generate

# Hard stop before any write if this isn't tokens.do's own database.
MIGRATE_URL="$MIGRATE_URL" node scripts/db-guard.mjs

# Baseline: a database created earlier with `prisma db push` already has every table but no
# migration history, so 0001_init would fail with "relation already exists". If the live
# database exactly matches the schema, record 0001_init as applied instead of running it.
# Any real difference falls through to `migrate deploy`, which fails loudly and changes nothing.
# (An empty database needs no baseline; migrate deploy below creates everything.)
if ! npx prisma migrate diff --from-url "$MIGRATE_URL" --to-empty --exit-code >/dev/null 2>&1 \
   && ! DATABASE_URL="$MIGRATE_URL" npx prisma migrate status >/dev/null 2>&1; then
  if npx prisma migrate diff --from-url "$MIGRATE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code >/dev/null 2>&1; then
    echo "Database already matches the schema; recording 0001_init as applied (baseline)."
    DATABASE_URL="$MIGRATE_URL" npx prisma migrate resolve --rolled-back 0001_init >/dev/null 2>&1 || true
    DATABASE_URL="$MIGRATE_URL" npx prisma migrate resolve --applied 0001_init
  else
    # Structure only (no data): what the live database lacks or has extra vs. the schema.
    echo "Database does not match the schema. Changes needed to reach the schema:"
    npx prisma migrate diff --from-url "$MIGRATE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>&1 | grep -v '^--' | grep -v '^$' || true
  fi
fi

DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy
npx next build
