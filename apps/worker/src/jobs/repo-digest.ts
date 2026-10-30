import { AiError, prompts, type Ai, type RepoChunk } from "@stage-ready/ai";
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
      await ctx.progress({ pct: 70, step: "Muse Wonder is reading code paths for capabilities" });
      const ai = await ctx.aiFor(payload.projectId);
      const { capabilities: found, error: capabilitiesError } = await readCapabilities(ctx, ai, payload.githubFullName, scan);
      // A capability only counts when it points at a real file and line.
      const lineCount = new Map(files.map((f) => [f.path, f.content.split(/\r?\n/).length]));
      const capabilities: RepoFinding[] = found
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
        capabilitiesError,
      };
    }

    await ctx.progress({ pct: 88, step: "Saving the digest" });
    let digestUrl: string | null = null;
    try {
      // A digest whose model pass failed is not cached, so the next run tries again.
      digestUrl = digest.capabilitiesError ? null : await ctx.storage.putJson(digestKey, digest);
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
      capabilitiesError: digest.capabilitiesError ?? null,
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
    await ctx.progress({
      pct: 100,
      step: digest.capabilitiesError ? `Digest saved without capabilities: ${digest.capabilitiesError}` : `Digest ready: ${nf.format(digest.fileCount)} files, ${nf.format(findings.length)} findings`,
    });
    return { commitSha: sha, fileCount: digest.fileCount, findings: findings.length };
  } catch (error) {
    if (error instanceof GitHubError) throw new UserFacingError(error.message);
    throw error;
  }
}

/** Characters of code per capability call; one call when the whole selection fits. */
export const CAPABILITY_BATCH_CHARS = 100_000;
const BATCH_CONCURRENCY = 3;

/** Splits code chunks into batches of at most `maxChars` (a chunk is never split). */
export function batchChunks(chunks: RepoChunk[], maxChars = CAPABILITY_BATCH_CHARS): RepoChunk[][] {
  const batches: RepoChunk[][] = [];
  let current: RepoChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    const size = chunk.text.length + chunk.path.length + 32;
    if (current.length > 0 && used + size > maxChars) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push(chunk);
    used += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * The capability pass on Muse Wonder, in batches run a few at a time. One failed batch does not fail the
 * digest; only when every batch fails is the reason returned (and the deterministic scan still saved).
 */
async function readCapabilities(
  ctx: JobContext,
  ai: Ai,
  githubFullName: string,
  scan: { readme: string | null; dependencies: { name: string; version: string }[]; chunks: RepoChunk[]; findings: RepoFinding[] },
): Promise<{ capabilities: { summary: string; filePath: string; line: number | null }[]; error: string | null }> {
  const batches = batchChunks(scan.chunks);
  if (batches.length === 0) return { capabilities: [], error: null };
  const results: ({ ok: true; value: { summary: string; filePath: string; line: number | null }[] } | { ok: false; reason: string })[] = [];
  let next = 0;
  let done = 0;
  const run = async () => {
    while (next < batches.length) {
      const i = next++;
      const batch = batches[i] ?? [];
      try {
        const { value } = await ai.llm.generateObject(
          prompts.repoCapabilitiesV1({
            githubFullName,
            readme: scan.readme,
            dependencies: scan.dependencies.map((d) => `${d.name} ${d.version}`),
            chunks: batch,
            findings: scan.findings,
            maxChunkChars: CAPABILITY_BATCH_CHARS + 10_000,
          }),
        );
        results[i] = { ok: true, value: value.capabilities };
      } catch (error) {
        const reason = describeModelError(error);
        ctx.logger.warn({ err: error, batch: i, of: batches.length, detail: error instanceof AiError ? error.detail : undefined }, "capability batch failed");
        results[i] = { ok: false, reason };
      }
      done += 1;
      await ctx.progress({ pct: 70 + Math.round((done / batches.length) * 15), step: `Muse Wonder read ${done} of ${batches.length} code batches` });
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, run));
  const ok = results.flatMap((r) => (r.ok ? r.value : []));
  const failed = results.filter((r): r is { ok: false; reason: string } => !r.ok);
  if (failed.length === batches.length) return { capabilities: [], error: failed[0]?.reason ?? "The model call failed." };
  // Merge: one entry per file and line, at most 60.
  const seen = new Set<string>();
  const merged = ok.filter((c) => {
    const key = `${c.filePath}:${c.line ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { capabilities: merged.slice(0, 60), error: null };
}

/** The model error plus the API's own explanation (first 500 characters), for the job's failure reason. */
export function describeModelError(error: unknown): string {
  if (error instanceof AiError) {
    const detail = typeof error.detail === "string" ? error.detail : error.detail ? JSON.stringify(error.detail) : "";
    return detail ? `${error.message} ${detail.slice(0, 500)}` : error.message;
  }
  return (error as Error).message ?? "The model call failed.";
}
