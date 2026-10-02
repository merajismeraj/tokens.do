#!/bin/sh
# Vercel build: generate the client, apply pending migrations, build.
# Neon's Vercel integration was connected with the "tokens_" env prefix, so prefer those vars.
set -e
export DATABASE_URL="${tokens_DATABASE_URL:-$DATABASE_URL}"
npx prisma generate
# Migrations take advisory locks, which need a direct (unpooled) connection.
DATABASE_URL="${tokens_DATABASE_URL_UNPOOLED:-$DATABASE_URL}" npx prisma migrate deploy
npx next build
