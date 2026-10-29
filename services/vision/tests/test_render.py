import shutil
import subprocess
import time

import pytest
from fastapi.testclient import TestClient

from app import main
from app.render import RenderRequest, expected_ms, integrated_lufs, probe_duration_ms, render

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")


def request(**extra) -> RenderRequest:
    return RenderRequest.model_validate(
        {
            "clips": [
                {"source": "demo://hook", "inMs": 0, "outMs": 2600, "chapter": "Hook"},
                {"source": "demo://demo", "inMs": 400, "outMs": 3400, "chapter": "Demo", "transition": "cut"},
            ],
            "captions": [{"startMs": 1900, "endMs": 3200, "text": "Watch the plan appear"}, {"startMs": 4500, "endMs": 6000, "text": "Every report gets an owner"}],
            "intro": {"title": "Signal Garden", "subtitle": "Demo Mode"},
            "outro": {"title": "Thank you"},
            "cardMs": 1000,
            **extra,
        }
    )


def test_render_is_a_valid_mp4_within_100ms_and_minus_14_lufs(tmp_path):
    req = request()
    steps: list[str] = []
    out = render(req, tmp_path, lambda _pct, step: steps.append(step))
    mp4 = out["mp4"]
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate", "-of", "csv=p=0", str(mp4)], capture_output=True, text=True, check=True).stdout
    assert "h264,1920,1080,30/1" in probe
    assert "aac" in probe
    want = expected_ms(req)  # 1000 + 2600 + 3000 + 1000 - (200 + 40 + 200)
    assert want == 7160
    assert abs(probe_duration_ms(mp4) - want) <= 100
    assert abs(integrated_lufs(mp4) - (-14)) <= 1
    assert out["thumbnail"].exists() and out["thumbnail"].stat().st_size > 0
    assert steps[-1] == "Encoded MP4"


def test_render_endpoint_reports_progress_until_done(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "renderer", main.Renderer(root=tmp_path))
    client = TestClient(main.app)
    started = client.post("/render", json=request().model_dump(by_alias=True))
    assert started.status_code == 202
    job_id = started.json()["id"]
    deadline = time.time() + 120
    status = {}
    while time.time() < deadline:
        status = client.get(f"/render/{job_id}").json()
        if status["status"] in ("done", "failed"):
            break
        time.sleep(0.5)
    assert status["status"] == "done", status
    assert abs(status["durationMs"] - 7160) <= 100
    assert client.get("/render/nope").status_code == 404


def test_render_rejects_unsupported_sources(tmp_path):
    with pytest.raises(ValueError):
        render(request(clips=[{"source": "file:///etc/passwd", "inMs": 0, "outMs": 1000, "chapter": "Hook"}]), tmp_path, lambda *_: None)
