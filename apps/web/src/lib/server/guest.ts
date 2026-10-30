import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { users, type Db } from "@stage-ready/db";
import { and, eq, lt } from "drizzle-orm";

/** Guest demo: an anonymous user per browser, identified by a signed httpOnly cookie that lasts 24 h. */
export const GUEST_COOKIE = "sr_guest";
export const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
/** Guest users and their projects are deleted this long after creation. */
const GUEST_RETENTION_MS = 48 * 60 * 60 * 1000;

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`guest:${payload}`).digest("base64url");

/** `<userId>.<expiresAtMs>.<hmac>` */
export function guestToken(userId: string, secret: string, now = Date.now()): string {
  const payload = `${userId}.${now + GUEST_TTL_MS}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The guest user id in a valid, unexpired token; null otherwise. */
export function readGuestToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  const parts = token?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [userId, expires, mac] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${expires}`, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!(Number(expires) > now)) return null;
  return userId;
}

/** Creates a guest user and removes guests older than the retention window. */
export async function createGuest(db: Db): Promise<{ id: string }> {
  await db.delete(users).where(and(eq(users.isGuest, true), lt(users.createdAt, new Date(Date.now() - GUEST_RETENTION_MS))));
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(users)
    .values({ id, email: `guest-${id}@guest.stage-ready.invalid`, name: "Guest", isGuest: true })
    .returning({ id: users.id });
  if (!row) throw new Error("Could not create a guest user.");
  return row;
}

export const guestCookie = (token: string, secure: boolean) => ({ name: GUEST_COOKIE, value: token, httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: GUEST_TTL_MS / 1000 });
