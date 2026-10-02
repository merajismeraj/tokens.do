import { auth } from "@/auth";
import { SignInButton } from "@/components/Header";
import { normalizeUserCode } from "@/lib/cli-auth";
import { db } from "@/lib/db";
import { ApproveForm } from "./ApproveForm";

export const dynamic = "force-dynamic";

export default async function CliApprovePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  const userCode = normalizeUserCode(code);
  const session = await auth();

  const pending = userCode
    ? await db.deviceAuth.findUnique({ where: { userCode }, select: { deviceName: true, expiresAt: true, userId: true } })
    : null;
  const valid = pending && !pending.userId && pending.expiresAt > new Date();

  return (
    <>
      <section className="hero">
        <h1 className="h-sm">
          authorize cli<span className="cursor">_</span>
        </h1>
        <p className="meta">
          <span>Uploads daily token counts only</span>
          <span>Never prompts or code</span>
        </p>
      </section>

      <div className="card cli-approve">
        {!session?.user ? (
          <>
            <p>Sign in to link this device to your board profile.</p>
            <SignInButton redirectTo={`/cli?code=${encodeURIComponent(userCode)}`} />
          </>
        ) : !valid ? (
          <p className="error">
            {userCode ? "This code is invalid or expired." : "No code."} Run <code>npx tokens.do login</code> again.
          </p>
        ) : (
          <>
            <div>
              <div className="label">Device</div>
              <div className="big">{pending.deviceName}</div>
            </div>
            <div>
              <div className="label">Code: check it matches your terminal</div>
              <div className="big code">{userCode}</div>
            </div>
            <ApproveForm userCode={userCode} handle={session.user.handle ?? session.user.name ?? ""} />
          </>
        )}
      </div>
    </>
  );
}
