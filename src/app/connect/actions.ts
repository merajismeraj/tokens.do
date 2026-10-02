"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { config } from "@/lib/config";
import { encryptSecret, fingerprint } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getProvider, ProviderAuthError, type ProviderId } from "@/lib/providers";
import { syncConnection } from "@/lib/sync";

export interface ConnectState {
  ok?: boolean;
  error?: string;
}

export async function addConnection(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in first." };
  const userId = session.user.id;

  const adapter = getProvider(String(form.get("provider") ?? ""));
  const apiKey = String(form.get("apiKey") ?? "").trim();
  if (!adapter) return { error: "Pick a provider." };
  if (!apiKey.startsWith(adapter.keyPrefix)) {
    return { error: `That's not a ${adapter.name} admin key — it should start with "${adapter.keyPrefix}". Regular API keys can't read usage.` };
  }

  let org;
  try {
    org = await adapter.identify(apiKey);
  } catch (err) {
    if (err instanceof ProviderAuthError) return { error: `${adapter.name} rejected this key.` };
    return { error: `Couldn't reach ${adapter.name}. Try again in a minute.` };
  }

  const orgFingerprint = fingerprint(`${adapter.id}:${org.orgId}`);
  const existing = await db.connection.findUnique({
    where: { provider_orgFingerprint: { provider: adapter.id as ProviderId, orgFingerprint } },
  });
  if (existing && existing.userId !== userId) {
    return { error: `This ${adapter.name} organization is already claimed by another account.` };
  }
  if (!existing && (await db.connection.count({ where: { userId } })) >= config.maxConnectionsPerUser) {
    return { error: `You can connect up to ${config.maxConnectionsPerUser} organizations.` };
  }

  const data = {
    encryptedKey: encryptSecret(apiKey),
    keyHint: apiKey.slice(-4),
    orgName: org.orgName ?? null,
    status: "active" as const,
    lastError: null,
  };
  // Re-connecting the same org rotates the key in place and keeps history.
  const conn = existing
    ? await db.connection.update({ where: { id: existing.id }, data })
    : await db.connection.create({ data: { ...data, userId, provider: adapter.id, orgFingerprint } });

  const result = await syncConnection(conn);
  revalidatePath("/connect");
  revalidatePath("/");
  return result.ok ? { ok: true } : { error: `Connected, but the first sync failed: ${result.error}` };
}

export async function removeConnection(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) return;
  await db.connection.deleteMany({ where: { id: String(form.get("id")), userId: session.user.id } });
  revalidatePath("/connect");
  revalidatePath("/");
}
