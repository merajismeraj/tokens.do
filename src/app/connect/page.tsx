import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { config } from "@/lib/config";
import { addDays, startOfUtcDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatRelative, formatTokens } from "@/lib/format";
import { providerList, providers } from "@/lib/providers";
import { removeConnection } from "./actions";
import { ConnectForm } from "./ConnectForm";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const windowStart = startOfUtcDay(addDays(new Date(), -config.windowDays));
  const connections = await db.connection.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const totals = await db.usageDaily.groupBy({
    by: ["connectionId"],
    where: { connectionId: { in: connections.map((c) => c.id) }, date: { gte: windowStart } },
    _sum: { totalTokens: true },
  });
  const totalById = new Map(totals.map((t) => [t.connectionId, t._sum.totalTokens ?? 0n]));

  return (
    <>
      <section className="hero">
        <h1>Connect your models</h1>
        <p className="muted">
          Add every OpenAI and Anthropic org you own — usage is summed into one rank.{" "}
          <Link href="/">Back to the board →</Link>
        </p>
      </section>

      <ConnectForm
        options={providerList.map(({ id, name, keyPrefix, keyHelp, keyHelpUrl }) => ({
          id,
          name,
          keyPrefix,
          keyHelp,
          keyHelpUrl,
        }))}
      />

      {connections.length > 0 && (
        <div className="card">
          <table className="board">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Key</th>
                <th className="hide-sm">Status</th>
                <th className="num">Tokens ({config.windowDays}d)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`chip ${c.provider}`}>{providers[c.provider].name}</span>
                    {c.orgName && <span className="muted small"> {c.orgName}</span>}
                  </td>
                  <td className="mono muted">…{c.keyHint}</td>
                  <td className="hide-sm small">
                    {c.status === "invalid" ? (
                      <span className="error" title={c.lastError ?? undefined}>
                        Key rejected — reconnect
                      </span>
                    ) : c.lastError ? (
                      <span className="warn" title={c.lastError}>
                        Sync error, retrying daily
                      </span>
                    ) : c.lastSyncedAt ? (
                      <span className="muted">Synced {formatRelative(c.lastSyncedAt)}</span>
                    ) : (
                      <span className="muted">Pending</span>
                    )}
                  </td>
                  <td className="num mono strong">{formatTokens(totalById.get(c.id) ?? 0n)}</td>
                  <td className="num">
                    <form action={removeConnection}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn ghost small">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
