import { PrismaClient } from "@prisma/client";

/**
 * Vercel's Neon integration prefixes its variables with however the store was connected
 * (tokens_, tokens_do_db_, ...). Prefer a real DATABASE_URL, else the single *_DATABASE_URL.
 * Mirrors scripts/db-url.mjs, which the build uses.
 */
export function resolveDatabaseUrl(env: Record<string, string | undefined>, name = "DATABASE_URL") {
  const isPg = (v?: string) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v);
  if (isPg(env[name])) return env[name];
  const keys = Object.keys(env)
    .filter((k) => k.endsWith(`_${name}`) && isPg(env[k]))
    .sort();
  if (keys.length > 1) throw new Error(`Several databases connected (${keys.join(", ")}); set ${name} explicitly.`);
  return keys.length ? env[keys[0]] : undefined;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: resolveDatabaseUrl(process.env) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
