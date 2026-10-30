import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { loadRootEnv, sealSecret } from "@stage-ready/config";

loadRootEnv();
const secret = process.env.AUTH_SECRET;

// JWT sessions, no adapter tables: the users row is upserted on sign-in (lib/server/auth.ts).
// The GitHub access token stays sealed inside the encrypted session cookie and is never put in the session object.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(secret ? { secret } : {}),
  session: { strategy: "jwt" },
  providers:
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET, authorization: { params: { scope: "read:user user:email" } } })]
      : [],
  callbacks: {
    jwt({ token, account, profile }) {
      if (account?.access_token && secret) token.githubTokenSealed = sealSecret(account.access_token, secret);
      if (profile && typeof profile.login === "string") token.githubLogin = profile.login;
      return token;
    },
    session({ session, token }) {
      if (typeof token.githubLogin === "string") Object.assign(session.user, { githubLogin: token.githubLogin });
      return session;
    },
  },
});
