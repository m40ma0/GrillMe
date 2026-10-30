# Vision and media service

Python 3.12 + FastAPI. It serves:

- `WS /stt`: streaming speech to text with faster-whisper. Send PCM16 16 kHz mono as binary messages; receive `{"type": "partial" | "final", "text", "start_ms", "end_ms", "words"}`. Send `{"type": "flush"}` to finalise.
- `POST /track?prompts=spinner,error_dialog,progress_bar,result_region`: SAM 3.1 text-prompted UI regions for one JPEG frame (boxes normalised to 0–1). Returns 503 when SAM is not loaded; the realtime server then uses perceptual hashes only.
- `POST /phash`: the 9x8 difference hash of a JPEG, the same hash the browser computes.
- `GET /api/health`: reports whether SAM and faster-whisper are available.

## Run locally (CPU)

```sh
cd services/vision
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

faster-whisper downloads `WHISPER_MODEL` (default `tiny.en`) from Hugging Face on first use. Set `VISION_SERVICE_URL=http://localhost:8000` in the repo `.env` so the realtime server uses it for speech to text.

## SAM 3.1

SAM needs a GPU and Meta's checkpoint. Install Meta's `sam3` package on the GPU host, then set `SAM_CHECKPOINT` to the checkpoint path. Without it, `/track` reports unavailable and tracking falls back to hashes. The adapter is `Sam3Backend` in `app/sam_tracker.py`; confirm its calls against the SAM 3.1 release before relying on it.

## Modal (GPU)

```sh
modal serve services/vision/modal_app.py
```

See `modal_app.py` for the secret and volume it expects. Use the printed URL as `VISION_SERVICE_URL`.

## Tests

```sh
.venv/bin/python -m pytest
```
