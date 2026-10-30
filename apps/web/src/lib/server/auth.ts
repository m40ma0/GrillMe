import "server-only";
import { users } from "@stage-ready/db";
import { ensureDevUser } from "@stage-ready/db/seed";
import { getToken } from "next-auth/jwt";
import { eq, and } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "./db";
import { env } from "./env";
import { GUEST_COOKIE, readGuestToken } from "./guest";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  githubLogin: string | null;
  bypass: boolean;
  /** An anonymous guest-demo visitor: Demo Mode only, no repo linking or cloud upload. */
  guest: boolean;
}

/** The signed-in user, the local developer when DEV_AUTH_BYPASS=true, or a guest-demo visitor. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (env().DEV_AUTH_BYPASS) {
    const user = await ensureDevUser(db());
    return { id: user.id, email: user.email, name: user.name, githubLogin: user.githubLogin, bypass: true, guest: false };
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return guestUser();
  const githubLogin = (session.user as { githubLogin?: string }).githubLogin ?? null;
  const [row] = await db()
    .insert(users)
    .values({ email, name: session.user?.name ?? null, githubLogin })
    .onConflictDoUpdate({ target: users.email, set: { name: session.user?.name ?? null, githubLogin } })
    .returning();
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, githubLogin: row.githubLogin, bypass: false, guest: false };
});

async function guestUser(): Promise<CurrentUser | null> {
  const userId = readGuestToken((await cookies()).get(GUEST_COOKIE)?.value, env().AUTH_SECRET);
  if (!userId) return null;
  const [row] = await db()
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isGuest, true)));
  return row ? { id: row.id, email: row.email, name: "Guest", githubLogin: null, bypass: false, guest: true } : null;
}

/** The sealed GitHub token from the session cookie, for read-only repo access in jobs. */
export async function sealedGitHubToken(): Promise<string | undefined> {
  if (env().DEV_AUTH_BYPASS) return undefined;
  const token = await getToken({ req: { headers: await headers() }, secret: env().AUTH_SECRET, secureCookie: process.env.NODE_ENV === "production" });
  return typeof token?.githubTokenSealed === "string" ? token.githubTokenSealed : undefined;
}
