from io import BytesIO
from types import SimpleNamespace

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main
from app.phash import dhash, hamming
from app.sam_tracker import SamTracker
from app.stt import SAMPLE_RATE, Segmenter, run_job


def tone(ms: int, amp: int) -> bytes:
    n = SAMPLE_RATE * ms // 1000
    return (amp * np.sin(2 * np.pi * 220 * np.arange(n) / SAMPLE_RATE)).astype(np.int16).tobytes()


def jpeg(draw_box: bool) -> bytes:
    image = Image.new("RGB", (320, 180), "white")
    if draw_box:
        ImageDraw.Draw(image).rectangle((100, 50, 220, 130), fill="black")
    out = BytesIO()
    image.save(out, format="JPEG")
    return out.getvalue()


def test_segmenter_cuts_utterances_with_partials_and_a_final():
    seg = Segmenter()
    jobs = seg.feed(tone(500, 10)) + seg.feed(tone(2500, 8000)) + seg.feed(tone(900, 10))
    kinds = [j.kind for j in jobs]
    assert kinds.count("final") == 1
    assert kinds.count("partial") == 3  # at 1, 2 and 3 s of the ~3.1 s utterance
    final = next(j for j in jobs if j.kind == "final")
    assert 450 <= final.offset_ms <= 520
    assert 2.9 <= len(final.audio) / SAMPLE_RATE <= 3.3


def test_run_job_maps_whisper_segments_to_stream_times():
    word = SimpleNamespace(word=" instant", start=0.5, end=0.9)
    model = SimpleNamespace(transcribe=lambda audio, **kw: ([SimpleNamespace(text=" It is instant.", start=0.1, end=1.0, words=[word])], None))
    job = SimpleNamespace(kind="final", utterance_id=3, audio=np.zeros(16000, dtype=np.float32), offset_ms=4000.0)
    assert run_job(model, job) == {"type": "final", "id": "u3", "text": "It is instant.", "start_ms": 4100, "end_ms": 5000, "words": [{"w": "instant", "s": 4500, "e": 4900}]}


class FakeSam:
    def segment(self, image, prompt):
        return [((100.0, 50.0, 220.0, 130.0), 0.92), ((0.0, 0.0, 10.0, 10.0), 0.2)] if "spinner" in prompt else []


def test_sam_tracker_normalises_boxes_and_drops_low_scores():
    regions = SamTracker(FakeSam()).track(jpeg(True), ["spinner", "result_region"])
    assert [(r.label, r.score) for r in regions] == [("spinner", 0.92)]
    assert regions[0].box == (100 / 320, 50 / 180, 220 / 320, 130 / 180)


def test_tracker_is_unavailable_without_a_checkpoint():
    assert SamTracker.from_settings(None, "cpu").available is False


def test_dhash_sees_a_large_change():
    a = dhash(Image.open(BytesIO(jpeg(False))))
    b = dhash(Image.open(BytesIO(jpeg(True))))
    assert hamming(a, a) == 0
    assert hamming(a, b) >= 8


def test_health_and_track_without_sam():
    main.tracker.cache_clear()
    client = TestClient(main.app)
    assert client.get("/api/health").json()["tracker"] == "none"
    assert client.post("/track", content=jpeg(True), headers={"content-type": "image/jpeg"}).status_code == 503


def test_a_deployed_service_without_a_token_refuses_requests(monkeypatch):
    from app import main

    client = TestClient(main.app)
    monkeypatch.delenv("VISION_SERVICE_TOKEN", raising=False)
    monkeypatch.setenv("VISION_REQUIRE_TOKEN", "1")
    refused = client.post("/thumbnail", json={"source": "https://x.test/a.webm", "output": "https://x.test/b.jpg"})
    assert refused.status_code == 503
    assert "VISION_SERVICE_TOKEN" in refused.json()["detail"]
    monkeypatch.setenv("VISION_SERVICE_TOKEN", "secret")
    assert client.post("/thumbnail", json={"source": "https://x.test/a.webm", "output": "https://x.test/b.jpg"}).status_code == 401
    # Locally (no VISION_REQUIRE_TOKEN), an unset token still means an open service, as before.
    monkeypatch.delenv("VISION_REQUIRE_TOKEN")
    monkeypatch.delenv("VISION_SERVICE_TOKEN")
    assert client.get("/api/health").status_code == 200


def test_the_root_says_what_the_service_is_instead_of_404():
    from app import main

    reply = TestClient(main.app).get("/")
    assert reply.status_code == 200
    assert reply.json()["health"] == "/api/health"
