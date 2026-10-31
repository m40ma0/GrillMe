import { describe, expect, it } from "vitest";
import { MuseVoiceTranscriber, VOICE_CHUNK_MS, pcm16ToWav } from "../src/voice";

describe("pcm16ToWav", () => {
  it("writes a 16 kHz mono PCM16 RIFF header", () => {
    const wav = pcm16ToWav(new Int16Array([1, -1, 300]), 16_000);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(48, true)).toBe(300);
  });
});

describe("MuseVoiceTranscriber", () => {
  it("posts multipart ENDPOINTING requests and offsets the turns of each chunk", async () => {
    const calls: { url: string; request: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      calls.push({ url, request: JSON.parse(await (form.get("request") as Blob).text()) });
      return Response.json({ sessionId: "s", transcript: "hello there", audioDurationMs: 1000, turns: [{ turnId: 0, startMs: 100, endMs: 900, transcript: "hello there" }] });
    }) as unknown as typeof fetch;
    const t = new MuseVoiceTranscriber({ baseUrl: "https://api.meta.ai/v1/", apiKey: "k", model: "muse-voice-transcribe-1.0", fetch: fake });
    const samples = Math.floor((VOICE_CHUNK_MS / 1000) * 16_000) + 16_000; // two chunks
    const out = await t.transcribe(new Int16Array(samples), 16_000);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(calls[0]!.request).toEqual({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "ENDPOINTING" });
    expect(out.turns.map((x) => x.startMs)).toEqual([100, VOICE_CHUNK_MS + 100]);
    expect(out.modelId).toBe("muse-voice-transcribe-1.0");
  });

  it("raises the API's error body", async () => {
    const fake = (async () => new Response('{"error":{"message":"unsupported WAV"}}', { status: 400 })) as unknown as typeof fetch;
    const t = new MuseVoiceTranscriber({ baseUrl: "https://x", apiKey: "k", model: "m", fetch: fake });
    await expect(t.transcribe(new Int16Array(10), 16_000)).rejects.toMatchObject({ detail: expect.stringContaining("unsupported WAV") });
  });
});
