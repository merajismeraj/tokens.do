import { describe, expect, it } from "vitest";
import { UsageValidationError, validateCliUpload } from "@/lib/cli-usage";

const now = new Date("2026-09-20T12:00:00Z");
const row = (o: Record<string, unknown> = {}) => ({
  date: "2026-09-19",
  model: "claude-opus-4",
  inputTokens: 1000,
  outputTokens: 100,
  cachedTokens: 500,
  ...o,
});

describe("validateCliUpload", () => {
  it("accepts a valid upload and merges duplicate (date, model) rows", () => {
    const out = validateCliUpload({ provider: "claude_code", days: [row(), row({ inputTokens: 10, outputTokens: 1, cachedTokens: 0 })] }, now);
    expect(out.provider).toBe("claude_code");
    expect(out.rows).toEqual([
      { date: "2026-09-19", model: "claude-opus-4", inputTokens: 1010n, outputTokens: 101n, cachedTokens: 500n, totalTokens: 1111n },
    ]);
  });

  it.each([
    [{ provider: "openai", days: [] }, /provider/],
    [{ provider: "codex", days: "x" }, /array/],
    [{ provider: "codex", days: [row({ date: "19-09-2026" })] }, /YYYY-MM-DD/],
    [{ provider: "codex", days: [row({ date: "2026-09-25" })] }, /outside/],
    [{ provider: "codex", days: [row({ date: "2026-01-01" })] }, /outside/],
    [{ provider: "codex", days: [row({ inputTokens: -1 })] }, /non-negative/],
    [{ provider: "codex", days: [row({ outputTokens: 1.5 })] }, /non-negative/],
    [{ provider: "codex", days: [row({ cachedTokens: 5000 })] }, /cachedTokens/],
    [{ provider: "codex", days: [row({ inputTokens: 15e9 }), row({ model: "gpt-5", inputTokens: 6e9, cachedTokens: 0 })] }, /cap/],
  ])("rejects %j", (body, msg) => {
    expect(() => validateCliUpload(body, now)).toThrow(UsageValidationError);
    expect(() => validateCliUpload(body, now)).toThrow(msg);
  });

  it("allows tomorrow's date for users ahead of UTC", () => {
    expect(() => validateCliUpload({ provider: "codex", days: [row({ date: "2026-09-21" })] }, now)).not.toThrow();
  });
});
