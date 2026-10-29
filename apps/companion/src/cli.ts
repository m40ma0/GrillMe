#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { CompanionConfig, ServerMessage, type ClientMessage } from "@stage-ready/shared";
import { runPreflight } from "./preflight";
import { startProxy } from "./proxy";

// Stage Ready companion: joins a DemoGuard session from the presenter machine, watches the demo app's
// network through a local proxy, runs local pre-flight checks, and relays Panic / Resume / Freeze keys.

const VERSION = "0.5.0";
const { values } = parseArgs({
  options: { url: { type: "string" }, config: { type: "string", default: "stage-ready.demoguard.json" }, help: { type: "boolean", short: "h" } },
});
if (values.help || !values.url) {
  console.info(
    [
      "Usage: pnpm companion --url '<ws url from the DemoGuard page>' [--config stage-ready.demoguard.json]",
      "",
      "Copy the command from DemoGuard → Live control → Connect companion. Keys while connected:",
      "  p  Panic: switch to fallback now",
      "  r  Resume: back to live",
      "  f  Freeze",
      "  q  Quit",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}

async function loadConfig(path: string): Promise<CompanionConfig> {
  try {
    return CompanionConfig.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.info(`No ${path}; using defaults (no proxy target, no endpoints). See docs/companion.md.`);
      return CompanionConfig.parse({});
    }
    throw new Error(`${path} is not valid: ${(error as Error).message}`);
  }
}

const config = await loadConfig(values.config ?? "stage-ready.demoguard.json");
const deviceId = createHash("sha256").update(hostname()).digest("hex").slice(0, 12);
const ws = new WebSocket(values.url);
const send = (message: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(message));

if (config.target) {
  await startProxy({ target: config.target, port: config.proxyPort, timeoutMs: config.timeoutMs, onSignal: (s) => send({ type: "signal.network", ...s }) });
  console.info(`Proxy: http://127.0.0.1:${config.proxyPort} → ${config.target}. Open the demo through it so 5xx and timeouts are seen.`);
}

const preflight = async () => {
  const checks = await runPreflight(config);
  send({ type: "preflight.result", checks });
  for (const c of checks) console.info(`  ${c.status.toUpperCase().padEnd(7)} ${c.label}: ${c.detail}`);
};

let lastState = "";
ws.addEventListener("open", () => {
  console.info("Connected to the DemoGuard session.");
  send({ type: "companion.hello", deviceId, obsConnected: false, version: VERSION });
});
ws.addEventListener("message", (event) => {
  const parsed = ServerMessage.safeParse(JSON.parse(String(event.data)));
  if (!parsed.success) return;
  const m = parsed.data;
  if (m.type === "preflight.run") {
    console.info("Running pre-flight checks:");
    void preflight();
  } else if (m.type === "demoguard.state") {
    const line = `DemoGuard: ${m.state}${m.stepIndex !== undefined ? ` · step ${m.stepIndex + 1}` : ""}`;
    if (line !== lastState) console.info(line);
    lastState = line;
  } else if (m.type === "obs.switch")
    console.info(`Would switch to ${m.scene}${m.seekMs !== null ? ` at ${(m.seekMs / 1000).toFixed(1)} s of the fallback clip` : ""}. Video switching is not part of this build.`);
  else if (m.type === "error") console.error(`Server: ${m.message}`);
  else if (m.type === "session.summary") {
    console.info("The DemoGuard session ended.");
    process.exit(0);
  }
});
ws.addEventListener("close", (event) => {
  console.info(`Disconnected (${event.code}). Copy a fresh command from the DemoGuard page to reconnect.`);
  process.exit(event.code === 1000 ? 0 : 1);
});
ws.addEventListener("error", () => console.error("Could not reach the realtime server. Is `pnpm dev` running, and is the URL current?"));

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (data) => {
    const key = data.toString().toLowerCase();
    if (key === "p") send({ type: "demoguard.hotkey", action: "panic" });
    else if (key === "r") send({ type: "demoguard.hotkey", action: "resume" });
    else if (key === "f") send({ type: "demoguard.hotkey", action: "freeze" });
    else if (key === "q" || key === "\u0003") {
      ws.close(1000);
      process.exit(0);
    }
  });
}
