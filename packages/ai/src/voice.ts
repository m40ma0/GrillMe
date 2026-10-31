// Muse Voice Transcribe on the Meta Model API's file endpoint (https://dev.meta.ai/docs/api-reference/voice/transcribe):
//   POST {base}/asr/transcribe, multipart/form-data with
//     request: {"model":"muse-voice-transcribe-1.0","audioEncoding":"WAV","mode":"ENDPOINTING"}
//     audio:   a RIFF/WAVE file, mono PCM16 at 16 or 24 kHz, at most 10 minutes and 32 MB
//   → TranscribeResponse {sessionId, transcript, audioDurationMs, turns: [{turnId, startMs, endMs, transcript}]}
// The endpoint returns turns with times, not word timings. Longer recordings are sent in chunks.
import { AiError } from "./types";

export interface VoiceTurn {
  startMs: number;
  endMs: number;
  text: string;
}

export interface VoiceTranscript {
  modelId: string;
  turns: VoiceTurn[];
  audioDurationMs: number;
  latencyMs: number;
}

/** 9.5 minutes per request keeps every chunk under the 10-minute limit. */
export const VOICE_CHUNK_MS = 570_000;

/** Wraps mono PCM16 samples in a 44-byte RIFF/WAVE header. */
export function pcm16ToWav(pcm: Int16Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const data = pcm.length * 2;
  const out = new Uint8Array(44 + data);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, data, true);
  new Int16Array(out.buffer, 44, pcm.length).set(pcm);
  return out;
}

export class MuseVoiceTranscriber {
  constructor(private readonly config: { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number }) {}

  /** Transcribes a whole recording, chunk by chunk, with turn times relative to the start of `pcm`. */
  async transcribe(pcm: Int16Array, sampleRate: number): Promise<VoiceTranscript> {
    const started = Date.now();
    const perChunk = Math.floor((VOICE_CHUNK_MS / 1000) * sampleRate);
    const turns: VoiceTurn[] = [];
    let audioDurationMs = 0;
    for (let offset = 0; offset < pcm.length; offset += perChunk) {
      const chunk = pcm.subarray(offset, Math.min(pcm.length, offset + perChunk));
      const offsetMs = Math.round((offset / sampleRate) * 1000);
      const reply = await this.request(pcm16ToWav(chunk, sampleRate));
      audioDurationMs += reply.audioDurationMs;
      for (const t of reply.turns) if (t.transcript.trim()) turns.push({ startMs: offsetMs + t.startMs, endMs: offsetMs + t.endMs, text: t.transcript.trim() });
      // ENDPOINTING should always give turns; if a chunk has text but none, keep the text as one turn.
      if (reply.turns.length === 0 && reply.transcript.trim()) turns.push({ startMs: offsetMs, endMs: offsetMs + reply.audioDurationMs, text: reply.transcript.trim() });
    }
    return { modelId: this.config.model, turns, audioDurationMs, latencyMs: Date.now() - started };
  }

  private async request(wav: Uint8Array<ArrayBuffer>): Promise<{ transcript: string; audioDurationMs: number; turns: { startMs: number; endMs: number; transcript: string }[] }> {
    const form = new FormData();
    form.append("request", new Blob([JSON.stringify({ model: this.config.model, audioEncoding: "WAV", mode: "ENDPOINTING" })], { type: "application/json" }));
    form.append("audio", new Blob([wav], { type: "audio/wav" }), "rehearsal.wav");
    const doFetch = this.config.fetch ?? fetch;
    const response = await doFetch(`${this.config.baseUrl.replace(/\/+$/, "")}/asr/transcribe`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.config.apiKey}`, accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiError("http_error", `Muse Voice Transcribe answered ${response.status}`, detail.slice(0, 500));
    }
    const body = (await response.json()) as { transcript?: string; audioDurationMs?: number; turns?: { startMs?: number; endMs?: number; transcript?: string }[] };
    return {
      transcript: body.transcript ?? "",
      audioDurationMs: Number(body.audioDurationMs ?? 0),
      turns: (body.turns ?? []).map((t) => ({ startMs: Number(t.startMs ?? 0), endMs: Number(t.endMs ?? 0), transcript: t.transcript ?? "" })),
    };
  }
}
