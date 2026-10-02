import Link from "next/link";
import { auth } from "@/auth";
import { SignInButton } from "@/components/Header";
import { ProfileLink } from "@/components/ProfileLink";
import { RankDelta } from "@/components/RankDelta";
import { config } from "@/lib/config";
import { nextRefreshAt } from "@/lib/dates";
import { formatCount, formatRelative, formatTokens } from "@/lib/format";
import { getLatestLeaderboard, getStanding, type Standing } from "@/lib/leaderboard";
import { providers } from "@/lib/providers";

export const dynamic = "force-dynamic";

/** Visitors see the podium only; the rest is never sent until they sign in. */
const PREVIEW_ROWS = 3;
const LOCKED_ROWS = 5;

export default async function LeaderboardPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const board = await getLatestLeaderboard(signedIn ? config.pageSize : PREVIEW_ROWS);
  const standing = session?.user ? await getStanding(session.user.id, board?.snapshot.id ?? null) : null;
  const now = new Date();
  const ranked = board?.snapshot.userCount ?? 0;

  return (
    <>
      <section className="hero">
        <h1>
          Who burns the most tokens<span className="cursor">_</span>
        </h1>
        <p className="meta">
          <span>{formatCount(ranked)} ranked</span>
          <span>{config.windowDays}d window</span>
          {board && <span>{formatTokens(board.snapshot.totalTokens)} tokens tracked</span>}
          <span>refresh {formatRelative(nextRefreshAt(now), now)}</span>
        </p>
      </section>

      {standing ? <StandingCard standing={standing} /> : <Steps />}

      {!board || board.entries.length === 0 ? (
        <div className="card empty">First board drops at 00:00 UTC. Connect now to be on it.</div>
      ) : (
        <div className="card table-wrap">
          <table className="board">
            <thead>
              <tr>
                <th className="rank">#</th>
                <th>Builder</th>
                <th className="hide-sm">Providers</th>
                <th className="hide-sm">Top model</th>
                <th className="num">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e) => (
                <tr key={e.userId} className={e.userId === session?.user?.id ? "me" : undefined}>
                  <td className="rank">
                    <span className={e.rank <= 3 ? `medal m${e.rank}` : undefined}>{e.rank}</span>
                    <RankDelta rank={e.rank} prevRank={e.prevRank} />
                  </td>
                  <td>
                    <ProfileLink user={e.user} />
                  </td>
                  <td className="hide-sm">
                    {e.providers.map((p) => (
                      <span key={p} className={`chip ${p}`}>
                        {providers[p].name}
                      </span>
                    ))}
                  </td>
                  <td className="hide-sm muted">{e.topModel ?? "—"}</td>
                  <td className="num strong" title={e.totalTokens.toLocaleString("en-US")}>
                    {formatTokens(e.totalTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!signedIn && ranked > PREVIEW_ROWS && (
            <div className="locked">
              <div className="locked-rows" aria-hidden>
                {Array.from({ length: Math.min(LOCKED_ROWS, ranked - PREVIEW_ROWS) }, (_, i) => (
                  <div key={i} className="locked-row">
                    <span>{PREVIEW_ROWS + i + 1}</span>
                    <span className="avatar" />
                    <span className="bar" style={{ width: `${46 - i * 5}%` }} />
                    <span className="bar short" />
                  </div>
                ))}
              </div>
              <div className="locked-cta">
                <p>
                  <strong>+{formatCount(ranked - PREVIEW_ROWS)} more</strong> on the board.
                </p>
                <SignInButton label="Sign in with X to see all" />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Steps() {
  return (
    <ol className="steps">
      <li>
        <span className="step-n">01</span> Sign in with X
      </li>
      <li>
        <span className="step-n">02</span> Connect OpenAI / Anthropic
      </li>
      <li>
        <span className="step-n">03</span> Get ranked, daily
      </li>
    </ol>
  );
}

function StandingCard({ standing }: { standing: Standing }) {
  if (standing.kind === "unranked") {
    return (
      <div className="card standing">
        <div>
          <div className="label">Your rank</div>
          <div className="big">—</div>
        </div>
        <p className="muted">
          {standing.hasConnections ? "No usage in the window yet." : "Connect a model to get ranked."}
        </p>
        <Link href="/connect" className="btn primary">
          {standing.hasConnections ? "Manage" : "Connect"}
        </Link>
      </div>
    );
  }
  return (
    <div className="card standing">
      <div>
        <div className="label">{standing.kind === "ranked" ? "Your rank" : "Projected"}</div>
        <div className="big">
          #{formatCount(standing.rank)} <span className="muted small">/ {formatCount(standing.outOf)}</span>
        </div>
      </div>
      <div>
        <div className="label">Tokens · {config.windowDays}d</div>
        <div className="big">{formatTokens(standing.totalTokens)}</div>
      </div>
      {standing.kind === "ranked" ? (
        <RankDelta rank={standing.rank} prevRank={standing.prevRank} />
      ) : (
        <p className="muted small">Official at 00:00 UTC.</p>
      )}
    </div>
  );
}
