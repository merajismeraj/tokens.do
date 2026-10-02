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

const fullSizeAvatar = (url?: string) => url?.replace("_normal.", "_400x400.") ?? null;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [
    Twitter({
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
