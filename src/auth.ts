import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Twitter from "next-auth/providers/twitter";
import { db } from "@/lib/db";

declare module "next-auth" {
  interface User {
    handle?: string | null;
  }
  interface Session {
    user: { id: string; handle?: string | null } & DefaultSession["user"];
  }
}

interface XProfile {
  data: { id: string; name: string; username: string; profile_image_url?: string };
}

const X_ME_URL = "https://api.x.com/2/users/me?user.fields=profile_image_url";

/**
 * Auth.js parses /2/users/me without checking the status, so an X error (no API access, depleted credits,
 * app not in a project) surfaces as an opaque OAuthProfileParseError. This logs X's actual reason.
 */
async function fetchXProfile(accessToken: string | undefined): Promise<XProfile> {
  const res = await fetch(X_ME_URL, { headers: { authorization: `Bearer ${accessToken}` } });
  const body = (await res.json().catch(() => null)) as Partial<XProfile> | null;
  if (!res.ok || !body?.data?.id) {
    throw new Error(`X /2/users/me failed (${res.status}): ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body as XProfile;
}

const fullSizeAvatar = (url?: string) => url?.replace("_normal.", "_400x400.") ?? null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: { error: "/auth-error" },
  providers: [
    Twitter({
      userinfo: {
        url: X_ME_URL,
        request: async ({ tokens }: { tokens: { access_token?: string } }) => fetchXProfile(tokens.access_token),
      },
      profile(profile) {
        const { data } = profile as unknown as XProfile;
        return {
          id: data.id,
          name: data.name,
          email: null,
          image: fullSizeAvatar(data.profile_image_url),
          handle: data.username,
        };
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.handle = (user as { handle?: string | null }).handle ?? null;
      return session;
    },
  },
  events: {
    // Keep handle/avatar fresh — people rename on X.
    async signIn({ user, profile }) {
      const data = (profile as unknown as XProfile | undefined)?.data;
      if (!user.id || !data?.username) return;
      await db.user
        .update({
          where: { id: user.id },
          data: { handle: data.username, name: data.name, image: fullSizeAvatar(data.profile_image_url) },
        })
        .catch(() => undefined);
    },
  },
});
