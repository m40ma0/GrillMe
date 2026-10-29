import websocket from "@fastify/websocket";
import { RealtimeEnv, loadRootEnv, parseEnv } from "@stage-ready/config";
import { ClientMessage, type ServerMessage } from "@stage-ready/shared";
import Fastify from "fastify";

loadRootEnv();
const env = parseEnv("realtime", RealtimeEnv);
const app = Fastify({ logger: { level: env.LOG_LEVEL } });
await app.register(websocket);

app.get("/api/health", async () => ({ service: "realtime", status: "ok" }));

// Session orchestration (judges, auditor, DemoGuard) lands in M2; M0 validates the contract only.
app.get("/ws", { websocket: true }, (socket) => {
  const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
  socket.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) return;
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      send({ type: "error", code: "invalid_json", message: "Message must be valid JSON." });
      return;
    }
    const parsed = ClientMessage.safeParse(raw);
    if (!parsed.success) {
      send({ type: "error", code: "invalid_message", message: parsed.error.issues[0]?.message ?? "Unknown message type." });
      return;
    }
    send({ type: "error", code: "not_implemented", message: `${parsed.data.type} is handled from M2.` });
  });
});

await app.listen({ port: env.REALTIME_PORT, host: "0.0.0.0" });
