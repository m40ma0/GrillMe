import http from "node:http";
import type { AddressInfo } from "node:net";
import { CompanionConfig } from "@stage-ready/shared";
import { afterAll, describe, expect, it } from "vitest";
import { runPreflight } from "../src/preflight";
import { startProxy, type NetworkSignal } from "../src/proxy";

const app = http.createServer((req, res) => {
  if (req.url === "/slow") return void setTimeout(() => res.end("late"), 400);
  res.writeHead(req.url === "/boom" ? 503 : 200).end("ok");
});
await new Promise<void>((r) => app.listen(0, "127.0.0.1", r));
const target = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
const signals: NetworkSignal[] = [];
const proxy = await startProxy({ target, port: 0, timeoutMs: 150, onSignal: (s) => signals.push(s) });
const base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
afterAll(() => {
  proxy.close();
  app.close();
});

describe("companion proxy", () => {
  it("reports status and timing, and turns slow requests into timeouts", async () => {
    expect((await fetch(`${base}/api/ok?x=1`)).status).toBe(200);
    expect((await fetch(`${base}/boom`)).status).toBe(503);
    expect((await fetch(`${base}/slow`)).status).toBe(504);
    expect(signals.map((s) => [s.url, s.status])).toEqual([
      ["/api/ok", 200],
      ["/boom", 503],
      ["/slow", 0],
    ]);
  });
});

describe("companion pre-flight", () => {
  it("fails missing env vars, unreachable endpoints and a wrong login status; marks them critical", async () => {
    const config = CompanionConfig.parse({
      requiredEnv: ["DEMO_API_KEY"],
      endpoints: [{ url: `${target}/api/ok`, budgetMs: 1_000 }, { url: `${target}/boom` }],
      login: { url: `${target}/boom`, expectStatus: 200 },
      minFreeDiskGb: 0.001,
    });
    const checks = await runPreflight(config, {});
    const by = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(by["companion:env"]).toMatchObject({ status: "fail", critical: true, detail: "Missing: DEMO_API_KEY" });
    expect(by["companion:endpoint:0"]?.status).toBe("pass");
    expect(by["companion:endpoint:1"]?.status).toBe("fail");
    expect(by["companion:login"]?.status).toBe("fail");
    expect(by["companion:disk"]?.status).toBe("pass");
    expect(by["companion:obs"]).toMatchObject({ status: "warn", critical: false });
    expect((await runPreflight(config, { DEMO_API_KEY: "x" })).find((c) => c.id === "companion:env")?.status).toBe("pass");
  });
});
