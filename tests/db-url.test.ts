import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "@/lib/db";
// @ts-expect-error plain ESM module used by the build script
import { resolveDatabaseUrl as resolveInBuild } from "../scripts/db-url.mjs";

const pg = (n: string) => `postgresql://u:p@${n}.neon.tech/db`;

describe.each([
  ["app", resolveDatabaseUrl],
  ["build script", resolveInBuild],
])("resolveDatabaseUrl (%s)", (_, resolve) => {
  it("prefers a real DATABASE_URL", () => {
    expect(resolve({ DATABASE_URL: pg("a"), tokens_DATABASE_URL: pg("b") })).toBe(pg("a"));
  });
  it("ignores a placeholder and finds the prefixed integration var, whatever the prefix", () => {
    expect(resolve({ DATABASE_URL: "REPLACE_ME", tokens_do_db_DATABASE_URL: pg("new") })).toBe(pg("new"));
    expect(resolve({ tokens_DATABASE_URL: pg("x") })).toBe(pg("x"));
  });
  it("keeps pooled and unpooled apart", () => {
    const env = { p_DATABASE_URL: pg("pooled"), p_DATABASE_URL_UNPOOLED: pg("direct") };
    expect(resolve(env)).toBe(pg("pooled"));
    expect(resolve(env, "DATABASE_URL_UNPOOLED")).toBe(pg("direct"));
  });
  it("refuses to guess between two connected databases", () => {
    expect(() => resolve({ a_DATABASE_URL: pg("a"), b_DATABASE_URL: pg("b") })).toThrow(/Several databases/);
  });
  it("returns undefined when nothing is connected", () => {
    expect(resolve({ DATABASE_URL: "REPLACE_ME" })).toBeUndefined();
  });
});
