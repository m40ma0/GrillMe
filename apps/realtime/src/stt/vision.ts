import type { Segment } from "@stage-ready/shared";
import WebSocket from "ws";
import { SttUnavailableError, type SttHandlers, type SttStream } from "./types";

interface WireSegment {
  type: "partial" | "final" | "error";
  id?: string;
  text?: string;
  start_ms?: number;
  end_ms?: number;
  words?: { w: string; s: number; e: number }[];
  message?: string;
}

/** Streams PCM to the vision service's faster-whisper endpoint (local or on Modal) and relays partials and finals. */
export class VisionWhisperStt implements SttStream {
  readonly name = "faster-whisper";
  private offsetMs: number | null = null;

  private constructor(
    private readonly socket: WebSocket,
    private readonly handlers: SttHandlers,
  ) {
    socket.on("message", (data) => this.onMessage(String(data)));
    socket.on("error", (error) => handlers.error(error));
  }

  static async connect(baseUrl: string, token: string | undefined, handlers: SttHandlers): Promise<VisionWhisperStt> {
    const url = `${baseUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/stt`;
    const socket = new WebSocket(url, { headers: token ? { authorization: `Bearer ${token}` } : {}, handshakeTimeout: 5_000 });
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", (error) => reject(new SttUnavailableError(`Could not reach speech to text at ${url}: ${error.message}`)));
    });
    socket.send(JSON.stringify({ type: "config", sample_rate: 16_000, language: "en" }));
    return new VisionWhisperStt(socket, handlers);
  }

  private onMessage(raw: string) {
    let msg: WireSegment;
    try {
      msg = JSON.parse(raw) as WireSegment;
    } catch {
      return;
    }
    if (msg.type === "error") return this.handlers.error(new Error(msg.message ?? "Speech to text failed."));
    const offset = this.offsetMs ?? 0;
    const segment: Segment = {
      id: msg.id ?? `w-${msg.start_ms}`,
      startMs: Math.round((msg.start_ms ?? 0) + offset),
      endMs: Math.round((msg.end_ms ?? 0) + offset),
      speaker: "presenter",
      text: (msg.text ?? "").trim(),
      words: (msg.words ?? []).map((w) => ({ text: w.w.trim(), startMs: Math.round(w.s + offset), endMs: Math.round(w.e + offset) })),
    };
    if (!segment.text) return;
    if (msg.type === "final") this.handlers.final(segment);
    else this.handlers.partial(segment);
  }

  push(pcm: Int16Array, startMs: number): void {
    this.offsetMs ??= startMs;
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "flush" }));
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    this.socket.close();
  }
}
