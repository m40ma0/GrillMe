import { openSecret } from "@stage-ready/config";
import { route } from "@/lib/server/api";
import { sealedGitHubToken } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

/** Repos the signed-in GitHub user can read, for the setup wizard's picker. Empty without GitHub sign-in. */
export const GET = route(async () => {
  const sealed = await sealedGitHubToken();
  if (!sealed) return Response.json({ signedIn: false, repos: [] });
  const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=pushed", {
    headers: { authorization: `Bearer ${openSecret(sealed, env().AUTH_SECRET)}`, accept: "application/vnd.github+json", "user-agent": "StageReady/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return Response.json({ signedIn: true, repos: [] });
  const repos = (await response.json()) as { full_name: string; private: boolean; pushed_at: string }[];
  return Response.json({ signedIn: true, repos: repos.map((r) => ({ fullName: r.full_name, private: r.private, pushedAt: r.pushed_at })) });
});
