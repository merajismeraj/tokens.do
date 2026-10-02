import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, fingerprint } from "@/lib/crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("sk-admin-abc");
    const b = encryptSecret("sk-admin-abc");
    expect(a).not.toEqual(b);
    expect(decryptSecret(a)).toBe("sk-admin-abc");
  });

  it("rejects tampered ciphertext", () => {
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("fingerprints deterministically", () => {
    expect(fingerprint("openai:proj_1")).toBe(fingerprint("openai:proj_1"));
    expect(fingerprint("openai:proj_1")).not.toBe(fingerprint("openai:proj_2"));
  });
});
