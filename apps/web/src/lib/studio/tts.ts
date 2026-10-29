// Judge voices. In dev the provider is the browser's speechSynthesis with a fixed, distinct preset per
// persona. Presets pick a stock system voice and pitch; there is no voice cloning.

const PRESETS: Record<string, { pitch: number; rate: number; voiceIndex: number }> = {
  "preset-a": { pitch: 0.9, rate: 1.05, voiceIndex: 0 },
  "preset-b": { pitch: 1.15, rate: 1.0, voiceIndex: 1 },
  "preset-c": { pitch: 1.0, rate: 0.95, voiceIndex: 2 },
};

export function speakJudge(text: string, preset: string, events: { start: () => void; end: () => void }): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    events.start();
    const timer = setTimeout(events.end, 1_500 + text.split(/\s+/).length * 400);
    return () => clearTimeout(timer);
  }
  const p = PRESETS[preset] ?? PRESETS["preset-a"]!;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = voices[p.voiceIndex % Math.max(1, voices.length)];
  if (voice) utterance.voice = voice;
  utterance.pitch = p.pitch;
  utterance.rate = p.rate;
  utterance.onstart = events.start;
  utterance.onend = events.end;
  utterance.onerror = events.end;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}
