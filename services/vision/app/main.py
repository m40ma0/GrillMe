"""Stage Ready vision and media service: streaming STT (faster-whisper), SAM 3.1 UI tracking, frame hashes, take transcription and the Director render."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import asdict
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .config import settings
from .phash import dhash_jpeg
from .render import Renderer, RenderRequest, fetch
from .sam_tracker import LABELS, SamTracker
from .stt import Model, Segmenter, load_model, run_job, transcribe_file

log = logging.getLogger("vision")
app = FastAPI(title="Stage Ready Vision and Media")


@lru_cache(maxsize=1)
def tracker() -> SamTracker:
    s = settings()
    return SamTracker.from_settings(s.sam_checkpoint, s.sam_device)


_model: Model | None = None
_model_error: str | None = None


def whisper() -> Model:
    global _model, _model_error
    if _model is None:
        s = settings()
        try:
            _model = load_model(s.whisper_model, s.whisper_device, s.whisper_compute)
        except Exception as error:  # noqa: BLE001 - reported to the caller as a typed error
            _model_error = str(error)
            raise
    return _model


def check_token(authorization: str | None) -> None:
    token = settings().token
    if token and authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="Invalid vision service token.")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"service": "vision", "status": "ok", "tracker": "sam" if tracker().available else "none", "stt": "faster-whisper" if _model_error is None else f"error: {_model_error}"}


@app.post("/track")
async def track(request: Request, prompts: str = Query(",".join(LABELS)), authorization: str | None = Header(default=None)) -> dict[str, object]:
    check_token(authorization)
    if not tracker().available:
        raise HTTPException(status_code=503, detail="SAM is not loaded. Set SAM_CHECKPOINT on a GPU host.")
    jpeg = await request.body()
    regions = await asyncio.to_thread(tracker().track, jpeg, [p for p in prompts.split(",") if p])
    return {"regions": [asdict(r) for r in regions]}


@app.post("/phash")
async def phash(request: Request, authorization: str | None = Header(default=None)) -> dict[str, str]:
    check_token(authorization)
    return {"hash": f"{dhash_jpeg(await request.body()):016x}"}


renderer = Renderer()


class TranscribeRequest(BaseModel):
    source: str


@app.post("/transcribe")
async def transcribe(body: TranscribeRequest, authorization: str | None = Header(default=None)) -> dict[str, object]:
    """Word-timestamped transcript of a recorded take (presigned URL)."""
    check_token(authorization)
    try:
        model = await asyncio.to_thread(whisper)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"faster-whisper could not load: {error}") from error
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "take"
        try:
            await asyncio.to_thread(fetch, body.source, path)
        except Exception as error:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Could not download the take: {error}") from error
        return await asyncio.to_thread(transcribe_file, model, str(path))


@app.post("/transcribe/upload")
async def transcribe_upload(request: Request, authorization: str | None = Header(default=None)) -> dict[str, object]:
    """Word-timestamped transcript of a short recording sent as the request body (drill answers)."""
    check_token(authorization)
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty recording.")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recordings over 25 MB go through /transcribe with a storage URL.")
    try:
        model = await asyncio.to_thread(whisper)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"faster-whisper could not load: {error}") from error
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "answer"
        path.write_bytes(data)
        return await asyncio.to_thread(transcribe_file, model, str(path))


@app.post("/render", status_code=202)
def start_render(body: RenderRequest, authorization: str | None = Header(default=None)) -> dict[str, object]:
    check_token(authorization)
    return renderer.submit(body).public()


@app.get("/render/{job_id}")
def render_status(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, object]:
    check_token(authorization)
    job = renderer.jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown render job. Render jobs live in one service instance; retry the render.")
    return job.public()


@app.websocket("/stt")
async def stt(socket: WebSocket) -> None:
    token = settings().token
    if token and socket.headers.get("authorization") != f"Bearer {token}":
        await socket.close(code=4401)
        return
    await socket.accept()
    try:
        model = await asyncio.to_thread(whisper)
    except Exception as error:  # noqa: BLE001
        await socket.send_text(json.dumps({"type": "error", "message": f"faster-whisper could not load: {error}"}))
        await socket.close()
        return
    segmenter = Segmenter()
    busy = False

    async def handle(jobs: list) -> None:
        nonlocal busy
        for job in jobs:
            # Partials are skipped while a transcription runs; finals always run.
            if job.kind == "partial" and busy:
                continue
            busy = True
            try:
                out = await asyncio.to_thread(run_job, model, job)
            finally:
                busy = False
            if out:
                await socket.send_text(json.dumps(out))

    try:
        while True:
            message = await socket.receive()
            if message.get("bytes") is not None:
                asyncio.create_task(handle(segmenter.feed(message["bytes"])))
            elif message.get("text"):
                data = json.loads(message["text"])
                if data.get("type") == "flush":
                    await handle(segmenter.flush())
            elif message.get("type") == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        pass
