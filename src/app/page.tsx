import Link from "next/link";
import { Fragment } from "react";
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

/** Visitors get a 20-row board: the top 5 are real, the rest are blurred placeholders. Real ranks 6+ are never sent until sign-in. */
const PREVIEW_ROWS = 5;
const VISITOR_ROWS = 20;
/** Ghost rows shown above the unlock prompt. */
const CTA_AFTER = 2;

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
          tokens<span className="tld"><span className="dot">.</span>do</span>
          <span className="cursor">_</span>
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
                <th className="rank c-rank">#</th>
                <th>Builder</th>
                <th className="hide-sm c-prov">Providers</th>
                <th className="hide-sm c-model">Top model</th>
                <th className="num c-tok">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {board.entries.map((e) => (
                <tr key={e.userId} className={e.userId === session?.user?.id ? "me" : undefined}>
                  <td className="rank">
                    <span className={e.rank <= 3 ? `medal m${e.rank}` : undefined}>{String(e.rank).padStart(2, "0")}</span>
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
            {!signedIn && ranked > PREVIEW_ROWS && (
              <tbody className="ghost">
                {Array.from({ length: Math.min(VISITOR_ROWS, ranked) - PREVIEW_ROWS }, (_, i) => (
                  <Fragment key={i}>
                    {i === CTA_AFTER && <LockedCta hidden={ranked - PREVIEW_ROWS} />}
                    <GhostRow rank={PREVIEW_ROWS + i + 1} />
                  </Fragment>
                ))}
                {Math.min(VISITOR_ROWS, ranked) - PREVIEW_ROWS <= CTA_AFTER && <LockedCta hidden={ranked - PREVIEW_ROWS} />}
              </tbody>
            )}
          </table>

        </div>
      )}
    </>
  );
}

function LockedCta({ hidden }: { hidden: number }) {
  const cta = (
    <div className="locked-cta">
      <p>
        <strong>+{formatCount(hidden)}</strong> builders
      </p>
      <SignInButton label="Sign in with X to unlock" />
    </div>
  );
  return (
    // colSpan must match the visible column count, or mobile grows phantom columns.
    <>
      <tr className="cta-row hide-sm">
        <td colSpan={5}>{cta}</td>
      </tr>
      <tr className="cta-row show-sm">
        <td colSpan={3}>{cta}</td>
      </tr>
    </>
  );
}

/** Pseudo-random but stable widths so the blurred rows look like real data. */
function GhostRow({ rank }: { rank: number }) {
  const w = (n: number) => `${4 + ((rank * n) % 7)}ch`;
  return (
    <tr aria-hidden>
      <td className="rank">{String(rank).padStart(2, "0")}</td>
      <td>
        <span className="who">
          <span className="avatar" />
          <span>
            <span className="name">
              <span className="blk" style={{ width: w(3) }} />
            </span>
            <span className="handle">
              <span className="blk dim" style={{ width: w(5) }} />
            </span>
          </span>
        </span>
      </td>
      <td className="hide-sm">
        <span className="blk dim" style={{ width: "9ch" }} />
      </td>
      <td className="hide-sm">
        <span className="blk dim" style={{ width: w(2) }} />
      </td>
      <td className="num">
        <span className="blk" style={{ width: "5ch" }} />
      </td>
    </tr>
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
