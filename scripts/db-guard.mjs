// Refuses to migrate a database that isn't tokens.do's own. Runs before Prisma writes anything,
// so pointing the project at another app's database fails the build without touching it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const dir = "prisma/migrations";
const migrations = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const ourTables = new Set(["_prisma_migrations"]);
for (const m of migrations) {
  for (const [, table] of readFileSync(join(dir, m, "migration.sql"), "utf8").matchAll(/CREATE TABLE "([^"]+)"/g)) ourTables.add(table);
}

const db = new PrismaClient({ datasourceUrl: process.env.MIGRATE_URL });
try {
  const tables = (
    await db.$queryRaw`SELECT table_name FROM information_schema.tables
                       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
  ).map((r) => r.table_name);

  const foreignTables = tables.filter((t) => !ourTables.has(t));
  const foreignMigrations = tables.includes("_prisma_migrations")
    ? (await db.$queryRaw`SELECT DISTINCT migration_name FROM "_prisma_migrations"`)
        .map((r) => r.migration_name)
        .filter((n) => !migrations.includes(n))
    : [];

  if (foreignTables.length || foreignMigrations.length) {
    const list = (xs) => xs.slice(0, 8).join(", ") + (xs.length > 8 ? `, +${xs.length - 8} more` : "");
    console.error("REFUSING TO MIGRATE: this database belongs to something other than tokens.do. Nothing was changed.");
    if (foreignTables.length) console.error(`  Unknown tables: ${list(foreignTables)}`);
    if (foreignMigrations.length) console.error(`  Unknown migrations: ${list(foreignMigrations)}`);
    console.error("  Connect a dedicated, empty database to this project.");
    process.exit(1);
  }
  console.log(`Database check passed (${tables.length} tables, all tokens.do's).`);
} finally {
  await db.$disconnect();
}
