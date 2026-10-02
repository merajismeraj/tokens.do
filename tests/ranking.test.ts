import { describe, expect, it } from "vitest";
import { assignRanks } from "@/lib/ranking";

describe("assignRanks", () => {
  it("uses competition ranking for ties", () => {
    const rows = [500n, 300n, 300n, 100n].map((totalTokens, i) => ({ id: i, totalTokens }));
    expect(assignRanks(rows).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("handles empty input", () => {
    expect(assignRanks([])).toEqual([]);
  });
});
