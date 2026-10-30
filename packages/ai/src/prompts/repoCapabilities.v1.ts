import { RepoCapabilities, type RepoFinding } from "@stage-ready/shared";
import { UNTRUSTED_NOTICE, quoted } from "../json";
import type { Prompt } from "../types";

export interface RepoChunk {
  path: string;
  startLine: number;
  text: string;
}

export function repoCapabilitiesV1(input: {
  githubFullName: string;
  readme: string | null;
  dependencies: string[];
  chunks: RepoChunk[];
  findings: RepoFinding[];
  maxChunkChars?: number;
}): Prompt<RepoCapabilities> {
  return {
    id: "repoCapabilities",
    version: 1,
    model: "wonder",
    schema: RepoCapabilities,
    system: [
      "You read a repository digest and list what the code can actually do, each with the file and line that implements it.",
      UNTRUSTED_NOTICE,
      "Only list capabilities you can point to in the given chunks. Line numbers are absolute in the file: chunk startLine plus the offset. Return at most 30.",
    ].join("\n"),
    user: [
      `Repository: ${input.githubFullName}`,
      quoted("readme", input.readme ?? "(none)", 8_000),
      quoted("dependencies", input.dependencies.join("\n"), 8_000),
      quoted("code_chunks", input.chunks.map((c) => `--- ${c.path} (startLine ${c.startLine})\n${c.text}`).join("\n"), input.maxChunkChars ?? 90_000),
    ].join("\n\n"),
    // Without a model nothing reads the code paths, so the mock claims no capabilities beyond what the scan found.
    mock: () => ({
      capabilities: input.findings
        .filter((f) => f.kind === "capability")
        .slice(0, 30)
        .map((f) => ({ summary: f.summary, filePath: f.filePath, line: f.line })),
    }),
  };
}
