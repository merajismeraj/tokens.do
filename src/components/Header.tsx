import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";

export async function Header() {
  const session = await auth();
  return (
    <header className="header">
      <div className="container bar">
      <Link href="/" className="logo">
        tokens<span>.do</span>
      </Link>
      <nav>
        {session?.user ? (
          <>
            <Link href="/connect" className="btn ghost">
              connect
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="avatar-btn" title="Sign out">
                {session.user.image ? <img src={session.user.image} alt="" className="avatar" /> : null}
                <span>@{session.user.handle ?? session.user.name}</span>
              </button>
            </form>
          </>
        ) : (
          <SignInButton />
        )}
      </nav>
      </div>
    </header>
  );
}

export function SignInButton({ label = "Sign in with X" }: { label?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("twitter", { redirectTo: "/connect" });
      }}
    >
      <button className="btn primary">{label}</button>
    </form>
  );
}
