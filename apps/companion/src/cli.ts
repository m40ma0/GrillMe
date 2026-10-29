import OBSWebSocket from "obs-websocket-js";

const obs = new OBSWebSocket();
const obsUrl = process.env.OBS_WS_URL ?? "ws://localhost:4455";
try {
  await obs.connect(obsUrl, process.env.OBS_WS_PASSWORD);
  console.info(`Connected to OBS at ${obsUrl}`);
} catch (error) {
  console.info(`OBS is not connected (${error instanceof Error ? error.message : "connection failed"}). Companion health checks remain available.`);
}
