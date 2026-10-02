/** Standard competition ranking ("1224"): ties share a rank, the next rank skips. Input must be sorted desc. */
export function assignRanks<T extends { totalTokens: bigint }>(sorted: T[]): Array<T & { rank: number }> {
  let rank = 0;
  let prev: bigint | undefined;
  return sorted.map((row, i) => {
    if (prev === undefined || row.totalTokens !== prev) rank = i + 1;
    prev = row.totalTokens;
    return { ...row, rank };
  });
}
