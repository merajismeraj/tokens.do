import Link from "next/link";
import { auth } from "@/auth";
import { SignInButton } from "@/components/Header";
import { RankDelta } from "@/components/RankDelta";
import { config } from "@/lib/config";
import { nextRefreshAt } from "@/lib/dates";
import { formatCount, formatRelative, formatTokens } from "@/lib/format";
import { getLatestLeaderboard, getStanding, type Standing } from "@/lib/leaderboard";
import { providers } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const [session, board] = await Promise.all([auth(), getLatestLeaderboard()]);
  const standing = session?.user ? await getStanding(session.user.id, board?.snapshot.id ?? null) : null;
  const now = new Date();

  return (
    <>
      <section className="hero">
        <h1>Who&apos;s burning the most tokens?</h1>
        <p className="muted">
          Global ranks across {formatCount(board?.snapshot.userCount ?? 0)} builders · trailing {config.windowDays} days ·
          {board ? ` updated ${formatRelative(board.snapshot.generatedAt, now)} ·` : ""} next refresh{" "}
          {formatRelative(nextRefreshAt(now), now)}
        </p>
        {board && (
          <p className="grand">
            <strong>{formatTokens(board.snapshot.totalTokens)}</strong> tokens tracked
          </p>
        )}
      </section>

      {session?.user ? <StandingCard standing={standing!} /> : <Steps />}

      {!board || board.entries.length === 0 ? (
        <div className="card empty">
          The first leaderboard drops at 00:00 UTC. Connect a model now and you&apos;ll be on it.
        </div>
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
              {board.entries.map((e) => {
                const me = e.userId === session?.user?.id;
                return (
                  <tr key={e.userId} className={me ? "me" : undefined}>
                    <td className="num rank">
                      <span className={e.rank <= 3 ? `medal m${e.rank}` : undefined}>{e.rank}</span>
                      <RankDelta rank={e.rank} prevRank={e.prevRank} />
                    </td>
                    <td>
                      <a
                        className="who"
                        href={e.user.handle ? `https://x.com/${e.user.handle}` : undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {e.user.image ? <img src={e.user.image} alt="" className="avatar" /> : <span className="avatar" />}
                        <span>
                          <span className="name">{e.user.name ?? e.user.handle}</span>
                          {e.user.handle && <span className="handle">@{e.user.handle}</span>}
                        </span>
                      </a>
                    </td>
                    <td className="hide-sm">
                      {e.providers.map((p) => (
                        <span key={p} className={`chip ${p}`}>
                          {providers[p].name}
                        </span>
                      ))}
                    </td>
                    <td className="hide-sm mono muted">{e.topModel ?? "—"}</td>
                    <td className="num mono strong" title={e.totalTokens.toLocaleString("en-US")}>
                      {formatTokens(e.totalTokens)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Steps() {
  return (
    <section className="steps">
      <div className="card step">
        <span className="step-n">1</span>
        <h3>Sign in with X</h3>
        <p className="muted">Your handle and avatar show on the board.</p>
        <SignInButton />
      </div>
      <div className="card step">
        <span className="step-n">2</span>
        <h3>Connect your models</h3>
        <p className="muted">OpenAI and/or Anthropic via a read-only admin key. Add as many orgs as you own.</p>
      </div>
      <div className="card step">
        <span className="step-n">3</span>
        <h3>Get ranked</h3>
        <p className="muted">Usage syncs daily and you get a global rank, refreshed every 24h.</p>
      </div>
    </section>
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
          {standing.hasConnections
            ? "No usage in the window yet. Burn some tokens and check back after the next refresh."
            : "Connect a model to get on the board."}
        </p>
        <Link href="/connect" className="btn primary">
          {standing.hasConnections ? "Manage connections" : "Connect a model"}
        </Link>
      </div>
    );
  }
  return (
    <div className="card standing">
      <div>
        <div className="label">{standing.kind === "ranked" ? "Your global rank" : "Projected rank"}</div>
        <div className="big">
          #{formatCount(standing.rank)} <span className="muted small">of {formatCount(standing.outOf)}</span>
        </div>
      </div>
      <div>
        <div className="label">Tokens ({config.windowDays}d)</div>
        <div className="big mono">{formatTokens(standing.totalTokens)}</div>
      </div>
      {standing.kind === "ranked" ? (
        <RankDelta rank={standing.rank} prevRank={standing.prevRank} />
      ) : (
        <p className="muted small">Becomes official at the next 00:00 UTC refresh.</p>
      )}
    </div>
  );
}
