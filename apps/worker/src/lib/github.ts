import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Parser, type ReadEntry } from "tar";
import { SKIP_DIRS, isTextPath, type RepoFile } from "./repo-scan";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface GitHubClient {
  repo(fullName: string): Promise<{ visibility: "public" | "private" | "unknown"; defaultBranch: string }>;
  commitSha(fullName: string, ref: string): Promise<string>;
  /** Number of files in the tree, for progress labels. */
  fileCount(fullName: string, sha: string): Promise<number | null>;
  /** Reads text files from the tarball at `sha`. Read-only: nothing is ever written to the repo. */
  files(fullName: string, sha: string, onProgress: (read: number) => void): Promise<{ files: RepoFile[]; totalEntries: number }>;
}

export function createGitHubClient(apiUrl: string, token?: string): GitHubClient {
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "StageReady/0.1", "x-github-api-version": "2022-11-28" };
  if (token) headers.authorization = `Bearer ${token}`;
  const get = async (path: string) => {
    const response = await fetch(`${apiUrl}${path}`, { headers, redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (response.status === 404) throw new GitHubError(token ? "Repo not found, or your GitHub account cannot read it." : "Repo not found. Private repos need GitHub sign-in.", 404);
    if (response.status === 403 || response.status === 429)
      throw new GitHubError(
        `GitHub refused the request (${response.status}): the rate limit was reached or this account cannot read the repo. Sign in with GitHub or try again later.`,
        response.status,
      );
    if (!response.ok) throw new GitHubError(`GitHub returned ${response.status} for ${path}.`, response.status);
    return response;
  };

  return {
    async repo(fullName) {
      const json = (await (await get(`/repos/${fullName}`)).json()) as { private?: boolean; visibility?: string; default_branch?: string };
      const visibility = json.visibility === "public" || json.private === false ? "public" : json.visibility === "private" || json.private === true ? "private" : "unknown";
      return { visibility, defaultBranch: json.default_branch ?? "main" };
    },
    async commitSha(fullName, ref) {
      const json = (await (await get(`/repos/${fullName}/commits/${encodeURIComponent(ref)}`)).json()) as { sha?: string };
      if (!json.sha) throw new GitHubError(`Could not resolve ${ref} to a commit.`, 422);
      return json.sha;
    },
    async fileCount(fullName, sha) {
      try {
        const json = (await (await get(`/repos/${fullName}/git/trees/${sha}?recursive=1`)).json()) as { tree?: { type: string }[] };
        return json.tree?.filter((node) => node.type === "blob").length ?? null;
      } catch {
        return null;
      }
    },
    async files(fullName, sha, onProgress) {
      const response = await get(`/repos/${fullName}/tarball/${sha}`);
      if (!response.body) throw new GitHubError("GitHub returned an empty archive.", 502);
      const files: RepoFile[] = [];
      let totalEntries = 0;
      let totalBytes = 0;
      const parser = new Parser({
        onReadEntry: (entry: ReadEntry) => {
          // Strip the "<owner>-<repo>-<sha>/" prefix GitHub adds.
          const path = entry.path.split("/").slice(1).join("/");
          if (entry.type !== "File" || !path) return entry.resume();
          totalEntries++;
          onProgress(totalEntries);
          if (SKIP_DIRS.test(path) || !isTextPath(path) || entry.size > 512_000 || files.length >= 5_000 || totalBytes > 60_000_000) return entry.resume();
          const parts: Buffer[] = [];
          entry.on("data", (chunk: Buffer) => parts.push(chunk));
          entry.on("end", () => {
            const content = Buffer.concat(parts).toString("utf8");
            totalBytes += content.length;
            if (!content.includes("\u0000")) files.push({ path, content });
          });
        },
      });
      await pipeline(Readable.fromWeb(response.body as WebReadableStream), parser);
      return { files, totalEntries };
    },
  };
}
