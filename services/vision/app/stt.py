"""Streaming speech to text with faster-whisper: energy VAD cuts utterances, partials every second, a final at each pause."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Protocol

import numpy as np

SAMPLE_RATE = 16_000
FRAME = 320  # 20 ms


@dataclass
class Job:
    kind: str  # "partial" | "final"
    utterance_id: int
    audio: np.ndarray
    offset_ms: float


@dataclass
class Segmenter:
    """Turns a PCM16 stream into transcription jobs. Pure: no model, so it is unit-tested directly."""

    end_silence_ms: int = 600
    partial_every_ms: int = 1_000
    max_utterance_ms: int = 15_000
    margin_db: float = 12.0
    min_db: float = -45.0
    _carry: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.int16))
    _samples_seen: int = 0
    _noise_db: float = -60.0
    _speech_run: int = 0
    _silence_ms: int = 0
    _utterance: list[np.ndarray] = field(default_factory=list)
    _utterance_start: int | None = None
    _since_partial: int = 0
    _id: int = 0

    def _flush_job(self, kind: str) -> Job | None:
        if self._utterance_start is None or not self._utterance:
            return None
        audio = np.concatenate(self._utterance).astype(np.float32) / 32768.0
        return Job(kind=kind, utterance_id=self._id, audio=audio, offset_ms=self._utterance_start * 1000 / SAMPLE_RATE)

    def feed(self, pcm: bytes) -> list[Job]:
        samples = np.concatenate([self._carry, np.frombuffer(pcm[: len(pcm) - len(pcm) % 2], dtype=np.int16)])
        jobs: list[Job] = []
        offset = 0
        while offset + FRAME <= len(samples):
            frame = samples[offset : offset + FRAME]
            start_sample = self._samples_seen + offset
            offset += FRAME
            energy = float(np.mean((frame.astype(np.float32) / 32768.0) ** 2))
            db = 10 * np.log10(energy + 1e-10)
            speech = db > max(self.min_db, self._noise_db + self.margin_db)
            if not speech:
                self._noise_db = self._noise_db * 0.98 + db * 0.02
            if self._utterance_start is None:
                self._speech_run = self._speech_run + 1 if speech else 0
                if self._speech_run >= 3:
                    self._utterance_start = max(0, start_sample - 2 * FRAME)
                    self._utterance = [samples[max(0, offset - 3 * FRAME) : offset].copy()]
                    self._silence_ms = 0
                    self._since_partial = 0
                continue
            self._utterance.append(frame.copy())
            self._since_partial += 20
            self._silence_ms = 0 if speech else self._silence_ms + 20
            length_ms = sum(len(u) for u in self._utterance) * 1000 // SAMPLE_RATE
            if self._silence_ms >= self.end_silence_ms or length_ms >= self.max_utterance_ms:
                job = self._flush_job("final")
                if job:
                    jobs.append(job)
                self._id += 1
                self._utterance_start = None
                self._utterance = []
                self._speech_run = 0
            elif self._since_partial >= self.partial_every_ms:
                self._since_partial = 0
                job = self._flush_job("partial")
                if job:
                    jobs.append(job)
        self._samples_seen += offset
        self._carry = samples[offset:].copy()
        return jobs

    def flush(self) -> list[Job]:
        job = self._flush_job("final")
        self._utterance_start = None
        self._utterance = []
        return [job] if job else []


class Model(Protocol):
    def transcribe(self, audio: np.ndarray, **kwargs: Any) -> tuple[Iterable[Any], Any]: ...


def run_job(model: Model, job: Job) -> dict[str, Any] | None:
    """Transcribes one job into the wire format the realtime server expects (times in stream ms)."""
    segments, _info = model.transcribe(job.audio, language="en", beam_size=1, word_timestamps=job.kind == "final", vad_filter=False, condition_on_previous_text=False)
    texts: list[str] = []
    words: list[dict[str, float | str]] = []
    start: float | None = None
    end = 0.0
    for seg in segments:
        texts.append(seg.text.strip())
        start = seg.start if start is None else start
        end = seg.end
        for w in getattr(seg, "words", None) or []:
            words.append({"w": w.word.strip(), "s": round(job.offset_ms + w.start * 1000), "e": round(job.offset_ms + w.end * 1000)})
    text = " ".join(t for t in texts if t).strip()
    if not text:
        return None
    return {
        "type": job.kind,
        "id": f"u{job.utterance_id}",
        "text": text,
        "start_ms": round(job.offset_ms + (start or 0) * 1000),
        "end_ms": round(job.offset_ms + end * 1000),
        "words": words,
    }


def load_model(name: str, device: str, compute_type: str) -> Model:
    from faster_whisper import WhisperModel

    return WhisperModel(name, device=device, compute_type=compute_type)


def transcribe_file(model: Model, path: str) -> dict[str, Any]:
    """Whole-file transcript of a take with word timestamps (ms), in the Director's format."""
    segments, info = model.transcribe(path, language="en", beam_size=5, word_timestamps=True, vad_filter=True)  # type: ignore[arg-type]
    words: list[dict[str, Any]] = []
    texts: list[str] = []
    for seg in segments:
        texts.append(seg.text.strip())
        for w in getattr(seg, "words", None) or []:
            words.append({"text": w.word.strip(), "startMs": round(w.start * 1000), "endMs": round(w.end * 1000)})
    return {"text": " ".join(t for t in texts if t).strip(), "words": words, "durationMs": round(float(getattr(info, "duration", 0) or 0) * 1000)}
