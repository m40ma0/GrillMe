import { ServerMessage, type ClientMessage } from "@stage-ready/shared";

/**
 * Realtime connection. If it drops, everything sent meanwhile is buffered (up to ~60 s of audio)
 * and flushed on reconnect, so the server re-syncs without losing the presenter's words.
 */
export class StudioSocket {
  private ws: WebSocket | null = null;
  private buffer: (string | ArrayBuffer)[] = [];
  private closedByUs = false;
  private attempts = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly handlers: { message: (m: ServerMessage) => void; status: (connected: boolean, reconnecting: boolean) => void },
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.url}?token=${encodeURIComponent(this.token)}`);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => {
        this.attempts = 0;
        this.handlers.status(true, false);
        for (const item of this.buffer.splice(0)) ws.send(item);
        resolve();
      };
      ws.onmessage = (event) => {
        const parsed = ServerMessage.safeParse(JSON.parse(String(event.data)));
        if (parsed.success) this.handlers.message(parsed.data);
      };
      ws.onerror = () => reject(new Error("Could not connect to the realtime server."));
      ws.onclose = (event) => {
        this.handlers.status(false, !this.closedByUs);
        if (this.closedByUs || event.code === 4401 || event.code === 4404 || event.code === 4403) return;
        const delay = Math.min(8_000, 500 * 2 ** this.attempts++);
        setTimeout(() => void this.connect().catch(() => undefined), delay);
      };
    });
  }

  private push(item: string | ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(item);
    else {
      this.buffer.push(item);
      if (this.buffer.length > 400) this.buffer.splice(0, this.buffer.length - 400);
    }
  }

  json(message: ClientMessage) {
    this.push(JSON.stringify(message));
  }

  binary(data: Uint8Array) {
    this.push(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  }

  close() {
    this.closedByUs = true;
    this.ws?.close(1000);
  }
}
