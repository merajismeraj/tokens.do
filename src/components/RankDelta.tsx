export function RankDelta({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  if (prevRank == null) return <span className="delta new">new</span>;
  const d = prevRank - rank;
  if (d === 0) return <span className="delta flat">–</span>;
  return <span className={`delta ${d > 0 ? "up" : "down"}`}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
}
