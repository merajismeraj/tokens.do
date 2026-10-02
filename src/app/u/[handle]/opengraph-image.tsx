import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { config } from "@/lib/config";
import { formatCount, formatTokens } from "@/lib/format";
import { getProfile } from "@/lib/profile";

// Rendered on request for the share card X shows under a post. Uses the site's font and palette.
export const runtime = "nodejs";
export const alt = "tokens.do rank card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#000000";
const TEXT = "#fafafa";
const MUTED = "#7a7a7a";
const ACCENT = "#c6ff00";
const LINE = "#2a2a2a";

/** Fetch the X avatar ourselves so a slow or missing image can't fail the whole card. */
async function avatarDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [profile, regular, bold] = await Promise.all([
    getProfile(handle),
    readFile(join(process.cwd(), "assets/fonts/jetbrains-mono-latin-400-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/jetbrains-mono-latin-800-normal.woff")),
  ]);
  const s = profile?.standing;
  const ranked = profile && s && s.kind !== "unranked" ? s : null;
  const avatar = await avatarDataUrl(profile?.user.image ?? null);
  const name = profile?.user.handle ?? handle;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: TEXT,
          padding: "64px 72px",
          fontFamily: "JetBrains Mono",
          border: `1px solid ${LINE}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} width={88} height={88} style={{ borderRadius: 44, border: `2px solid ${LINE}` }} />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                background: "#161616",
                color: ACCENT,
                fontSize: 44,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {name[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {profile?.user.name && <div style={{ fontSize: 36, fontWeight: 800 }}>{profile.user.name}</div>}
            <div style={{ fontSize: 30, color: MUTED }}>{`@${name}`}</div>
          </div>
        </div>

        {ranked ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, color: MUTED, letterSpacing: 4 }}>WORLD TOKEN MAXXER</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
              <div style={{ fontSize: 200, fontWeight: 800, color: ACCENT, lineHeight: 1, letterSpacing: -8 }}>
                {`#${formatCount(ranked.rank)}`}
              </div>
              <div style={{ fontSize: 36, color: MUTED, paddingBottom: 24 }}>{`of ${formatCount(ranked.outOf)}`}</div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 800, marginTop: 12 }}>
              {`${formatTokens(ranked.totalTokens)} tokens · ${config.windowDays}d`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 64, fontWeight: 800 }}>Who burns the most tokens?</div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 34 }}>
          <div style={{ display: "flex", fontWeight: 800 }}>
            tokens<span style={{ color: ACCENT }}>.do</span>
          </div>
          <div style={{ color: MUTED, fontSize: 26 }}>where do you rank?</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "JetBrains Mono", data: regular, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: bold, weight: 800, style: "normal" },
      ],
    },
  );
}
