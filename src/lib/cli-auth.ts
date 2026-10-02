import { createHash, randomBytes, randomInt } from "node:crypto";
import { db } from "./db";

export const DEVICE_CODE_TTL_MS = 10 * 60_000;
export const POLL_INTERVAL_S = 3;

// No 0/O/1/I/L: the user reads this code off a terminal and compares it in the browser.
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function newUserCode(): string {
  const chars = Array.from({ length: 8 }, () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizeUserCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export const newDeviceCode = () => randomBytes(32).toString("base64url");
export const newCliToken = () => `tdo_${randomBytes(32).toString("base64url")}`;

/** Resolves `Authorization: Bearer tdo_…` to a device, or null. */
export async function authenticateDevice(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("tdo_")) return null;
  const device = await db.cliDevice.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, handle: true } } },
  });
  if (device) await db.cliDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device;
}
