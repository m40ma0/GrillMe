import Fastify from "fastify";
import websocket from "@fastify/websocket";

const app = Fastify({ logger: true });
await app.register(websocket);
app.get("/api/health", async () => ({ service: "realtime", status: "ok" }));
app.get("/ws", { websocket: true }, (socket) => {
  socket.send(JSON.stringify({ type: "connected", service: "stage-ready-realtime" }));
  socket.on("message", (message: Buffer) => {
    try {
      const event: unknown = JSON.parse(message.toString());
      socket.send(JSON.stringify({ type: "ack", received: event }));
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Message must be valid JSON." }));
    }
  });
});
const port = Number(process.env.REALTIME_PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
