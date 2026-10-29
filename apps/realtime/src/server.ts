import websocket from "@fastify/websocket";
import { createAi } from "@stage-ready/ai";
import { RealtimeEnv, loadRootEnv, parseEnv, startTelemetry, verifySessionToken } from "@stage-ready/config";
import { createDb } from "@stage-ready/db";
import { ClientMessage, type ServerMessage } from "@stage-ready/shared";
import { BinaryKind, decodeBinary, splitFramePayload } from "@stage-ready/shared/ws-binary";
import pino from "pino";
import Fastify from "fastify";
import { loadContext } from "./session/context";
import { LiveSession } from "./session/live-session";
import { VisionTracker } from "./vision/tracker";

loadRootEnv();
const env = parseEnv("realtime", RealtimeEnv);
await startTelemetry("stage-ready-realtime");
const logger = pino({ name: "realtime", level: env.LOG_LEVEL });
// Session tokens travel in the WebSocket URL, so request logs carry the path only.
const app = Fastify({ loggerInstance: logger, disableRequestLogging: true });
app.addHook("onResponse", async (req, reply) => {
  req.log.info({ method: req.method, path: req.url.split("?")[0], status: reply.statusCode }, "request");
});
await app.register(websocket, { options: { maxPayload: 4 * 1024 * 1024 } });
const db = createDb(env.DATABASE_URL);
const live = createAi(env, logger);
const mock = createAi(env, logger, { forceMock: true });
app.log.info({ models: live.mode, reason: live.reason }, "model adapters ready");

/** Live sessions survive a dropped connection for two minutes so the browser can reconnect and re-sync. */
const RECONNECT_GRACE_MS = 120_000;
const sessions = new Map<string, { session: LiveSession; expiry: NodeJS.Timeout | null }>();

app.get("/api/health", async () => ({ service: "realtime", status: "ok", sessions: sessions.size, models: live.mode }));

app.get("/ws", { websocket: true }, async (socket, req) => {
  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  // Hold messages that arrive while the token and session load, so none are dropped.
  const early: { data: Buffer; isBinary: boolean }[] = [];
  const hold = (data: Buffer, isBinary: boolean) => void early.push({ data, isBinary });
  socket.on("message", hold);
  const origin = req.headers.origin;
  if (origin && origin !== env.WEB_ORIGIN) {
    send({ type: "error", code: "forbidden_origin", message: "This origin may not open a session." });
    return socket.close(4403);
  }
  const token = new URL(req.url, "http://localhost").searchParams.get("token") ?? "";
  let claims;
  try {
    claims = await verifySessionToken(token, env.REALTIME_JWT_SECRET);
  } catch {
    send({ type: "error", code: "unauthorized", message: "The session token is missing, invalid or expired. Start the session again." });
    return socket.close(4401);
  }

  let entry = sessions.get(claims.sid);
  if (!entry) {
    const ctx = await loadContext(db, claims.sid, claims.pid);
    if (!ctx || ctx.ended) {
      send({ type: "error", code: "session_not_found", message: "This session does not exist or has already ended." });
      return socket.close(4404);
    }
    const session = new LiveSession(ctx, {
      db,
      ai: ctx.demoMode ? mock : live,
      logger: logger.child({ sessionId: claims.sid }),
      tracker: new VisionTracker(env.VISION_SERVICE_URL, env.VISION_SERVICE_TOKEN),
      visionUrl: env.VISION_SERVICE_URL,
      visionToken: env.VISION_SERVICE_TOKEN,
      speechModelConfigured: Boolean(env.MODEL_STT),
    });
    entry = { session, expiry: null };
    sessions.set(claims.sid, entry);
  }
  const current = entry;
  if (current.expiry) clearTimeout(current.expiry);
  current.expiry = null;
  current.session.attach(send);

  const onMessage = (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      try {
        const { kind, timestampMs, payload } = decodeBinary(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        if (kind === BinaryKind.audio) current.session.audio(timestampMs, payload);
        else {
          const { hash, jpeg } = splitFramePayload(payload);
          current.session.frame(timestampMs, hash, jpeg);
        }
      } catch (error) {
        send({ type: "error", code: "invalid_binary", message: (error as Error).message });
      }
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString());
    } catch {
      return send({ type: "error", code: "invalid_json", message: "Message must be valid JSON." });
    }
    const parsed = ClientMessage.safeParse(raw);
    if (!parsed.success) return send({ type: "error", code: "invalid_message", message: parsed.error.issues[0]?.message ?? "Unknown message type." });
    if ((parsed.data.type === "session.start" || parsed.data.type === "session.end") && parsed.data.sessionId !== claims.sid)
      return send({ type: "error", code: "forbidden", message: "The token is for a different session." });
    current.session.event(parsed.data).then(
      () => {
        if (parsed.data.type === "session.end") {
          sessions.delete(claims.sid);
          socket.close(1000);
        }
      },
      (error: unknown) => {
        app.log.error({ err: error }, "session event failed");
        send({ type: "error", code: "internal", message: "The realtime server could not handle that. Check its log." });
      },
    );
  };
  socket.off("message", hold);
  socket.on("message", onMessage);
  for (const m of early.splice(0)) onMessage(m.data, m.isBinary);

  socket.on("close", () => {
    if (!sessions.has(claims.sid)) return;
    current.session.detach();
    current.expiry = setTimeout(() => {
      sessions.delete(claims.sid);
      void current.session.end().catch((error: unknown) => app.log.error({ err: error }, "could not finalise an abandoned session"));
    }, RECONNECT_GRACE_MS);
  });
});

await app.listen({ port: env.REALTIME_PORT, host: "0.0.0.0" });
