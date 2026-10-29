import "server-only";
import { users } from "@stage-ready/db";
import { ensureDevUser } from "@stage-ready/db/seed";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "./db";
import { env } from "./env";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  githubLogin: string | null;
  bypass: boolean;
}

/** The signed-in user, or the local developer when DEV_AUTH_BYPASS=true. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (env().DEV_AUTH_BYPASS) {
    const user = await ensureDevUser(db());
    return { id: user.id, email: user.email, name: user.name, githubLogin: user.githubLogin, bypass: true };
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const githubLogin = (session.user as { githubLogin?: string }).githubLogin ?? null;
  const [row] = await db()
    .insert(users)
    .values({ email, name: session.user?.name ?? null, githubLogin })
    .onConflictDoUpdate({ target: users.email, set: { name: session.user?.name ?? null, githubLogin } })
    .returning();
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name, githubLogin: row.githubLogin, bypass: false };
});

/** The sealed GitHub token from the session cookie, for read-only repo access in jobs. */
export async function sealedGitHubToken(): Promise<string | undefined> {
  if (env().DEV_AUTH_BYPASS) return undefined;
  const token = await getToken({ req: { headers: await headers() }, secret: env().AUTH_SECRET, secureCookie: process.env.NODE_ENV === "production" });
  return typeof token?.githubTokenSealed === "string" ? token.githubTokenSealed : undefined;
}
