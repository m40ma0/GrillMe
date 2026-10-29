import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/lib/fetch-page";
import { scanRepo } from "../src/lib/repo-scan";

describe("scanRepo", () => {
  const scan = scanRepo([
    { path: "package.json", content: JSON.stringify({ dependencies: { "llama-api-client": "^0.4.0" }, devDependencies: { vitest: "^3.0.0" } }) },
    { path: "requirements.txt", content: "fastapi==0.115.0\nuvicorn[standard]>=0.30\n# comment\n" },
    { path: "src/api.ts", content: 'export function handler() {\n  // TODO: real model call\n  return mockResponse;\n}\nconst key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";\n' },
    { path: "src/api.test.ts", content: "it('a', () => {});\nit('b', () => {});\n" },
    { path: ".env", content: "META_API_KEY=abc" },
    { path: ".env.example", content: "META_API_KEY=" },
    { path: "README.md", content: "# Demo" },
  ]);
  const kinds = (kind: string) => scan.findings.filter((f) => f.kind === kind);

  it("reads dependencies from manifests", () => {
    expect(scan.dependencies.map((d) => d.name)).toEqual(["llama-api-client", "vitest", "fastapi", "uvicorn"]);
  });
  it("flags TODOs and secrets with file:line, and committed .env files", () => {
    expect(kinds("todo")).toEqual([expect.objectContaining({ filePath: "src/api.ts", line: 2 })]);
    expect(kinds("secret").map((f) => [f.filePath, f.line])).toEqual([
      ["src/api.ts", 5],
      [".env", null],
    ]);
    expect(kinds("secret")[0]?.summary).not.toContain("abcdefghijklmnop");
  });
  it("flags mock responses outside tests and counts test cases", () => {
    expect(kinds("mock_response")).toEqual([expect.objectContaining({ filePath: "src/api.ts", line: 3 })]);
    expect(kinds("test")).toEqual([expect.objectContaining({ filePath: "src/api.test.ts", summary: "2 test cases." })]);
  });
  it("keeps the README and source chunks for the capability pass", () => {
    expect(scan.readme).toBe("# Demo");
    expect(scan.chunks.map((c) => c.path)).toEqual(["src/api.ts"]);
  });
});

describe("htmlToText", () => {
  it("drops scripts and keeps block structure", () => {
    expect(htmlToText("<html><script>alert(1)</script><h1>Event</h1><p>Impact &amp; scale (40%)</p><ul><li>One</li></ul></html>")).toBe("Event\n\nImpact & scale (40%)\n\n- One");
  });
});
