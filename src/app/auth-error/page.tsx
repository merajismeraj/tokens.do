import Link from "next/link";
import { SignInButton } from "@/components/Header";

export const metadata = { title: "Sign-in failed · tokens.do" };

const MESSAGES: Record<string, string> = {
  AccessDenied: "You cancelled the X authorization.",
  Verification: "That sign-in link expired.",
};

/** Auth.js sends every sign-in failure here (pages.error). Details are in the server logs, never shown. */
export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <section className="hero">
      <h1 className="h-sm">
        sign-in failed<span className="cursor">_</span>
      </h1>
      <p className="muted">{(error && MESSAGES[error]) ?? "X didn't complete the sign-in. Try again in a minute."}</p>
      <p className="meta">
        <span>
          <Link href="/">Back to the board</Link>
        </span>
      </p>
      <div style={{ marginTop: 20 }}>
        <SignInButton label="Try again" />
      </div>
    </section>
  );
}
