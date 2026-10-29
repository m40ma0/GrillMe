import { prompts } from "@stage-ready/ai";
import { openSecret } from "@stage-ready/config";
import { repoFindings, repos } from "@stage-ready/db";
import { RepoDigest, type JobPayload, type RepoFinding } from "@stage-ready/shared";
import { eq } from "drizzle-orm";
import { UserFacingError, type JobContext } from "../lib/context";
import { GitHubError, createGitHubClient } from "../lib/github";
import { scanRepo } from "../lib/repo-scan";
import { synthesizePatterns } from "./patterns";

type Payload = Extract<JobPayload, { name: "repo-digest" }>;

const nf = new Intl.NumberFormat("en-US");

export async function repoDigest(payload: Payload, ctx: JobContext) {
  const token = payload.githubTokenSealed ? openSecret(payload.githubTokenSealed, ctx.env.AUTH_SECRET) : undefined;
  const gh = createGitHubClient(ctx.env.GITHUB_API_URL, token);
  try {
    await ctx.progress({ pct: 2, step: `Looking up ${payload.githubFullName}` });
    const meta = await gh.repo(payload.githubFullName);
    const ref = payload.ref || meta.defaultBranch;
    const sha = await gh.commitSha(payload.githubFullName, ref);
    const digestKey = `digests/${payload.githubFullName}/${sha}.json`;

    // Digests are cached by commit SHA.
    let digest = await ctx.storage.getJson<RepoDigest>(digestKey).then((d) => (d ? (RepoDigest.safeParse(d).data ?? null) : null));
    if (digest) {
      await ctx.progress({ pct: 80, step: `Reusing the digest for ${sha.slice(0, 7)}` });
      digest = { ...digest, visibility: meta.visibility };
    } else {
      const total = await gh.fileCount(payload.githubFullName, sha);
      let lastReport = 0;
      const { files } = await gh.files(payload.githubFullName, sha, (read) => {
        if (read - lastReport < 25) return;
        lastReport = read;
        const pct = total ? 5 + Math.min(55, Math.round((read / total) * 55)) : 30;
        void ctx.progress({ pct, step: total ? `Reading repo: ${nf.format(read)} of ${nf.format(total)} files` : `Reading repo: ${nf.format(read)} files` });
      });
      await ctx.progress({ pct: 62, step: "Scanning dependencies, tests, TODOs and secrets" });
      const scan = scanRepo(files);
      await ctx.progress({ pct: 70, step: "Reading code paths for capabilities" });
      const ai = await ctx.aiFor(payload.projectId);
      const { value } = await ai.llm.generateObject(
        prompts.repoCapabilitiesV1({
          githubFullName: payload.githubFullName,
          readme: scan.readme,
          dependencies: scan.dependencies.map((d) => `${d.name} ${d.version}`),
          chunks: scan.chunks,
          findings: scan.findings,
        }),
      );
      // A capability only counts when it points at a real file and line.
      const lineCount = new Map(files.map((f) => [f.path, f.content.split(/\r?\n/).length]));
      const capabilities: RepoFinding[] = value.capabilities
        .filter((c) => lineCount.has(c.filePath) && (c.line === null || c.line <= (lineCount.get(c.filePath) ?? 0)))
        .map((c) => ({ kind: "capability", filePath: c.filePath, line: c.line, summary: c.summary, severity: "info" }));
      digest = {
        githubFullName: payload.githubFullName,
        commitSha: sha,
        visibility: meta.visibility,
        fileCount: files.length,
        files: files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content) })),
        dependencies: scan.dependencies,
        findings: [...scan.findings, ...capabilities],
        readme: scan.readme,
      };
    }

    await ctx.progress({ pct: 88, step: "Saving the digest" });
    let digestUrl: string | null = null;
    try {
      digestUrl = await ctx.storage.putJson(digestKey, digest);
    } catch (error) {
      ctx.logger.warn({ err: error }, "could not store the repo digest in S3; findings are still saved");
    }
    const digestTokens = Math.round(JSON.stringify(digest).length / 4);
    const values = {
      githubFullName: payload.githubFullName,
      ref,
      commitSha: sha,
      visibility: digest.visibility,
      digestUrl,
      digestTokens,
      fileCount: digest.fileCount,
      dependencies: digest.dependencies,
      readme: digest.readme,
    };
    const findings = digest.findings;
    await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(repos)
        .values({ projectId: payload.projectId, ...values })
        .onConflictDoUpdate({ target: repos.projectId, set: values })
        .returning({ id: repos.id });
      if (!row) throw new Error("Repo upsert returned no row.");
      await tx.delete(repoFindings).where(eq(repoFindings.repoId, row.id));
      for (let i = 0; i < findings.length; i += 500) {
        await tx.insert(repoFindings).values(findings.slice(i, i + 500).map((f) => ({ projectId: payload.projectId, repoId: row.id, ...f })));
      }
    });

    await ctx.progress({ pct: 95, step: "Re-checking winning patterns against the repo" });
    await synthesizePatterns(ctx, payload.projectId);
    await ctx.progress({ pct: 100, step: `Digest ready: ${nf.format(digest.fileCount)} files, ${nf.format(findings.length)} findings` });
    return { commitSha: sha, fileCount: digest.fileCount, findings: findings.length };
  } catch (error) {
    if (error instanceof GitHubError) throw new UserFacingError(error.message);
    throw error;
  }
}
