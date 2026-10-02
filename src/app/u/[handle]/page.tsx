import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/Header";
import { ProfileLink } from "@/components/ProfileLink";
import { SourceChip } from "@/components/SourceChip";
import { config } from "@/lib/config";
import { formatCount, formatTokens } from "@/lib/format";
import { getProfile } from "@/lib/profile";
import { shareOnXUrl, shareText } from "@/lib/share";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) return { title: "tokens.do" };
  const s = profile.standing;
  const title =
    s.kind === "unranked"
      ? `@${profile.user.handle} on tokens.do`
      : `@${profile.user.handle} is world #${formatCount(s.rank)} token maxxer`;
  const description =
    s.kind === "unranked"
      ? "Global leaderboard of the biggest LLM token spenders."
      : `${formatTokens(s.totalTokens)} tokens in ${config.windowDays} days. Where do you rank?`;
  // opengraph-image.tsx in this folder supplies og:image and twitter:image automatically.
  return {
    title,
    description,
    alternates: { canonical: `/u/${profile.user.handle}` },
    openGraph: { title, description, url: `/u/${profile.user.handle}`, siteName: "tokens.do", type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  const [profile, session] = await Promise.all([getProfile(handle), auth()]);
  if (!profile) notFound();

  const s = profile.standing;
  const isMe = session?.user?.id === profile.user.id;

  return (
    <>
      <section className="hero">
        <ProfileLink user={profile.user} />
      </section>

      <div className="card standing profile">
        {s.kind === "unranked" ? (
          <p className="muted">Not ranked yet.</p>
        ) : (
          <>
            <div>
              <div className="label">{s.kind === "ranked" ? "World rank" : "Projected rank"}</div>
              <div className="big xl">
                #{formatCount(s.rank)} <span className="muted small">/ {formatCount(s.outOf)}</span>
              </div>
            </div>
            <div>
              <div className="label">Tokens · {config.windowDays}d</div>
              <div className="big">{formatTokens(s.totalTokens)}</div>
            </div>
            {profile.topModel && (
              <div>
                <div className="label">Top model</div>
                <div className="model">{profile.topModel}</div>
              </div>
            )}
            {profile.providers.length > 0 && (
              <div className="sources">
                {profile.providers.map((p) => (
                  <SourceChip key={p} provider={p} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {isMe && s.kind !== "unranked" ? (
        <div className="cta-row">
          <a
            className="btn primary"
            href={shareOnXUrl(s.rank, profile.user.handle)}
            target="_blank"
            rel="noopener noreferrer"
            title={shareText(s.rank)}
          >
            Share on 𝕏
          </a>
          <Link href="/" className="btn ghost">
            View the board
          </Link>
        </div>
      ) : (
        <div className="card cta-card">
          <p>
            <strong>How many tokens do you burn?</strong> Sign in with X, run <code>npx tokens.do</code> or add a key, and get your
            world rank.
          </p>
          {session?.user ? (
            <Link href="/connect" className="btn primary">
              Get my rank
            </Link>
          ) : (
            <SignInButton label="Get my rank" />
          )}
        </div>
      )}
    </>
  );
}
