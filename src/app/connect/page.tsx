import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MethodBadge, SourceChip } from "@/components/SourceChip";
import { config } from "@/lib/config";
import { addDays, startOfUtcDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatRelative, formatTokens } from "@/lib/format";
import { providerList } from "@/lib/providers";
import { removeConnection, revokeDevice } from "./actions";
import { ConnectForm } from "./ConnectForm";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const windowStart = startOfUtcDay(addDays(new Date(), -config.windowDays));
  const [connections, devices] = await Promise.all([
    db.connection.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.cliDevice.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);
  const totals = await db.usageDaily.groupBy({
    by: ["connectionId"],
    where: { connectionId: { in: connections.map((c) => c.id) }, date: { gte: windowStart } },
    _sum: { totalTokens: true },
  });
  const totalById = new Map(totals.map((t) => [t.connectionId, t._sum.totalTokens ?? 0n]));
  const keyConnections = connections.filter((c) => c.encryptedKey);
  const cliByDevice = (deviceId: string) => connections.filter((c) => c.deviceId === deviceId);

  return (
    <>
      <section className="hero">
        <h1 className="h-sm">
          connect<span className="cursor">_</span>
        </h1>
        <p className="meta">
          <span>All sources sum into one rank</span>
          <span>
            <Link href="/">View board</Link>
          </span>
        </p>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>
            CLI <MethodBadge method="cli" />
          </h2>
          <p className="muted small">
            Claude Code and Codex, including Max, Pro and Plus subscriptions. No keys needed. Uploads daily token counts
            only, never prompts or code.
          </p>
        </header>
        <pre className="cmd">
          <span className="muted">$ </span>npx tokens.do
        </pre>
        <p className="muted small">
          Run it on each machine you code on. Add <code>--dry-run</code> to see exactly what gets sent. Schedule it daily to
          stay ranked: <code>0 23 * * * npx -y tokens.do sync</code>
        </p>
        {devices.length > 0 && (
          <table className="board">
            <thead>
              <tr>
                <th>Device</th>
                <th className="hide-sm">Sources</th>
                <th className="hide-sm">Last sync</th>
                <th className="num">Tokens · {config.windowDays}d</th>
                <th className="num c-act" />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const conns = cliByDevice(d.id);
                const total = conns.reduce((s, c) => s + (totalById.get(c.id) ?? 0n), 0n);
                const last = conns.map((c) => c.lastSyncedAt).filter(Boolean).sort().at(-1);
                return (
                  <tr key={d.id}>
                    <td className="strong">{d.name}</td>
                    <td className="hide-sm">
                      {conns.length ? conns.map((c) => <SourceChip key={c.id} provider={c.provider} />) : <span className="muted">—</span>}
                    </td>
                    <td className="hide-sm muted">{last ? formatRelative(last) : "never"}</td>
                    <td className="num strong">{formatTokens(total)}</td>
                    <td className="num">
                      <form action={revokeDevice}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="btn ghost small" title="Revokes the token and deletes this device's uploads">
                          revoke
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>
            Keys <MethodBadge method="key" /> <MethodBadge method="openrouter" />
          </h2>
          <p className="muted small">
            Verified: usage is read straight from the provider. Keys are encrypted at rest and only the last 4 characters
            are shown.
          </p>
        </header>
        <ConnectForm
          options={providerList.map(({ id, name, keyPrefix, keyHelp, keyHelpUrl }) => ({ id, name, keyPrefix, keyHelp, keyHelpUrl }))}
        />
        {keyConnections.length > 0 && (
          <table className="board">
            <thead>
              <tr>
                <th>Source</th>
                <th>Key</th>
                <th className="hide-sm">Status</th>
                <th className="num">Tokens · {config.windowDays}d</th>
                <th className="num c-act" />
              </tr>
            </thead>
            <tbody>
              {keyConnections.map((c) => (
                <tr key={c.id}>
                  <td>
                    <SourceChip provider={c.provider} />
                    {c.orgName && <span className="muted small"> {c.orgName}</span>}
                  </td>
                  <td className="muted">…{c.keyHint}</td>
                  <td className="hide-sm small">
                    {c.status === "invalid" ? (
                      <span className="error" title={c.lastError ?? undefined}>
                        Key rejected
                      </span>
                    ) : c.lastError ? (
                      <span className="warn" title={c.lastError}>
                        Retrying
                      </span>
                    ) : c.lastSyncedAt ? (
                      <span className="muted">Synced {formatRelative(c.lastSyncedAt)}</span>
                    ) : (
                      <span className="muted">Pending</span>
                    )}
                  </td>
                  <td className="num strong">{formatTokens(totalById.get(c.id) ?? 0n)}</td>
                  <td className="num">
                    <form action={removeConnection}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn ghost small">remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
