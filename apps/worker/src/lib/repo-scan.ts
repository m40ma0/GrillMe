import type { RepoChunk } from "@stage-ready/ai";
import type { RepoDependency, RepoFinding } from "@stage-ready/shared";

export interface RepoFile {
  path: string;
  content: string;
}

export const SKIP_DIRS = /(^|\/)(node_modules|\.git|dist|build|out|\.next|vendor|coverage|__pycache__|\.venv|venv|target|\.turbo)(\/|$)/;
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|swift|cs|c|cpp|h|vue|svelte)$/i;
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|swift|cs|c|cpp|h|vue|svelte|json|toml|ya?ml|md|txt|env|cfg|ini|gradle|lock|sh|sql|html|css)$|(^|\/)(Dockerfile|Makefile|\.env[\w.-]*|requirements[\w.-]*\.txt|go\.mod|Gemfile)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[jt]sx?$|(^|\/)test_[\w-]+\.py$|_test\.(py|go)$/i;
const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock|Cargo\.lock|uv\.lock)$/;

export const isTextPath = (path: string) => TEXT_EXT.test(path) && !LOCKFILE.test(path);

const SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key ID" },
  { re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/, label: "API secret key (sk-…)" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, label: "GitHub token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: "Slack token" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, label: "Google API key" },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, label: "Private key" },
  { re: /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*["'][A-Za-z0-9_\-./+=]{20,}["']/i, label: "Hard-coded credential" },
];
const TODO = /\b(TODO|FIXME|HACK|XXX)\b[:\s-]*(.{0,120})/;
const MOCK = /\b(mock(?:ed)?|fake|dummy|stub(?:bed)?|hard-?coded|canned|placeholder)[ _-]?(response|data|result|output|reply|answer)s?\b|\breturn\s+["'`](?:lorem ipsum|sample output|test response)/i;

const redact = (match: string) => (match.length <= 8 ? "****" : `${match.slice(0, 4)}…${match.slice(-2)}`);

function parseDependencies(file: RepoFile): RepoDependency[] {
  const name = file.path.split("/").at(-1) ?? "";
  try {
    if (name === "package.json") {
      const json = JSON.parse(file.content) as Record<string, Record<string, string> | undefined>;
      return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((key) =>
        Object.entries(json[key] ?? {}).map(([dep, version]) => ({ name: dep, version: String(version), manifest: file.path })),
      );
    }
  } catch {
    return [];
  }
  if (/^requirements[\w.-]*\.txt$/.test(name)) {
    return file.content
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*/, "").trim())
      .filter((l) => l && !l.startsWith("-"))
      .map((l) => {
        const [dep = l, version = "*"] = l.split(/\s*(?:==|>=|<=|~=|>|<)\s*/);
        return { name: dep.replace(/\[.*\]/, ""), version, manifest: file.path };
      });
  }
  if (name === "pyproject.toml") {
    const block = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(file.content)?.[1] ?? "";
    return [...block.matchAll(/["']([A-Za-z0-9_.\-[\]]+)\s*([^"']*)["']/g)].map((m) => ({ name: (m[1] ?? "").replace(/\[.*\]/, ""), version: (m[2] ?? "").trim() || "*", manifest: file.path }));
  }
  if (name === "go.mod") {
    return [...file.content.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w./-]+)\s+(v[\w.+-]+)/gm)].map((m) => ({ name: m[1] ?? "", version: m[2] ?? "", manifest: file.path }));
  }
  if (name === "Cargo.toml") {
    const block = /\[dependencies\]([\s\S]*?)(\n\[|$)/.exec(file.content)?.[1] ?? "";
    return [...block.matchAll(/^\s*([\w-]+)\s*=\s*(?:"([^"]+)"|\{[^}]*version\s*=\s*"([^"]+)")/gm)].map((m) => ({ name: m[1] ?? "", version: m[2] ?? m[3] ?? "*", manifest: file.path }));
  }
  return [];
}

export interface RepoScan {
  dependencies: RepoDependency[];
  findings: RepoFinding[];
  readme: string | null;
  chunks: RepoChunk[];
}

/** Deterministic scan: dependencies, TODOs, committed secrets, mock responses and tests. */
export function scanRepo(files: RepoFile[], options: { chunkBudgetChars?: number } = {}): RepoScan {
  const dependencies = files.flatMap(parseDependencies);
  const findings: RepoFinding[] = [];
  const add = (f: RepoFinding, cap: number) => {
    if (findings.filter((x) => x.kind === f.kind).length < cap) findings.push(f);
  };

  for (const dep of dependencies) add({ kind: "dependency", filePath: dep.manifest, line: null, summary: `${dep.name} ${dep.version}`.slice(0, 240), severity: "info" }, 300);

  const tests = files.filter((f) => TEST_FILE.test(f.path) && SOURCE_EXT.test(f.path));
  for (const test of tests) {
    const count = (test.content.match(/\b(it|test|def test_\w+|func Test\w+)\s*\(/g) ?? []).length;
    add({ kind: "test", filePath: test.path, line: null, summary: `${count} test case${count === 1 ? "" : "s"}.`, severity: "info" }, 200);
  }

  for (const file of files) {
    const fileName = file.path.split("/").at(-1) ?? "";
    if (/^\.env(\.[\w-]+)?$/.test(fileName) && !/\.(example|sample|template)$/.test(fileName)) {
      add({ kind: "secret", filePath: file.path, line: null, summary: "An environment file is committed to the repo.", severity: "high" }, 100);
    }
    const isTest = TEST_FILE.test(file.path);
    const lines = file.content.split(/\r?\n/);
    lines.forEach((text, i) => {
      if (text.length > 2_000) return;
      for (const { re, label } of SECRET_PATTERNS) {
        const m = re.exec(text);
        if (m && !/process\.env|os\.environ|getenv|example|your[-_]?key|xxxx|<.*>/i.test(text)) {
          add({ kind: "secret", filePath: file.path, line: i + 1, summary: `${label} committed (${redact(m[0])}).`, severity: "high" }, 100);
          break;
        }
      }
      const todo = TODO.exec(text);
      if (todo && SOURCE_EXT.test(file.path))
        add({ kind: "todo", filePath: file.path, line: i + 1, summary: `${todo[1]}: ${(todo[2] ?? "").trim()}`.slice(0, 240), severity: isTest ? "low" : "medium" }, 200);
      if (!isTest && SOURCE_EXT.test(file.path) && MOCK.test(text))
        add({ kind: "mock_response", filePath: file.path, line: i + 1, summary: `Possible mock or hard-coded response: ${text.trim().slice(0, 180)}`, severity: "medium" }, 100);
    });
  }

  const readme = files.find((f) => /^(?:[^/]+\/)?readme(\.md|\.rst|\.txt)?$/i.test(f.path.split("/").slice(-1)[0] ?? "") && f.path.split("/").length <= 2)?.content ?? null;

  // Chunks for the capability pass: source files first, entry points and larger files ahead.
  const budget = options.chunkBudgetChars ?? 400_000;
  const ranked = files
    .filter((f) => SOURCE_EXT.test(f.path) && !TEST_FILE.test(f.path))
    .sort((a, b) => Number(/(index|main|app|server|api|route)\.\w+$/.test(b.path)) - Number(/(index|main|app|server|api|route)\.\w+$/.test(a.path)) || b.content.length - a.content.length);
  const chunks: RepoChunk[] = [];
  let used = 0;
  for (const file of ranked) {
    const text = file.content.split(/\r?\n/).slice(0, 160).join("\n").slice(0, 6_000);
    if (used + text.length > budget) break;
    chunks.push({ path: file.path, startLine: 1, text });
    used += text.length;
  }

  return { dependencies, findings, readme: readme ? readme.slice(0, 20_000) : null, chunks };
}
