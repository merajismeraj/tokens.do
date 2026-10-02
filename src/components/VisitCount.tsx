import { connection } from "next/server";
import { formatCount } from "@/lib/format";
import { getVisitStats } from "@/lib/visits";

/** Stays hidden until the count looks credible; a launch-day "3 visitors" reads as a dead site. */
export const MIN_VISITORS_SHOWN = 100;

/** Footer counter. Renders nothing if the DB is unreachable, so it can never take a page down. */
export async function VisitCount() {
  await connection();
  const stats = await getVisitStats().catch(() => null);
  if (!stats || stats.total < MIN_VISITORS_SHOWN) return null;
  return (
    <span className="visits" title="Unique visitors per day, summed">
      <span className="live" aria-hidden />
      {formatCount(stats.total)} visitors · {formatCount(stats.today)} today
    </span>
  );
}
