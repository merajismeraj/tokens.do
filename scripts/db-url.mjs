// Prints the database URL to use. Vercel's Neon integration prefixes its variables with whatever
// the store was connected as (tokens_, tokens_do_db_, ...), so don't hard-code the prefix:
// prefer a real DATABASE_URL, else the single *_DATABASE_URL. Mirrors resolveDatabaseUrl in src/lib/db.ts.
// Usage: node scripts/db-url.mjs [DATABASE_URL|DATABASE_URL_UNPOOLED]
export function resolveDatabaseUrl(env, name = "DATABASE_URL") {
  const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v);
  if (isPg(env[name])) return env[name];
  const keys = Object.keys(env).filter((k) => k.endsWith(`_${name}`) && isPg(env[k])).sort();
  if (keys.length > 1) throw new Error(`Several databases connected (${keys.join(", ")}); set ${name} explicitly.`);
  return keys.length ? env[keys[0]] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = resolveDatabaseUrl(process.env, process.argv[2] || "DATABASE_URL");
  if (!url) process.exit(1);
  process.stdout.write(url);
}
