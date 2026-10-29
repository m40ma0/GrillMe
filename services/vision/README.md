# Vision and media service

Python 3.12 service for vision and media work (SAM 3.1 tracking, faster-whisper STT, FFmpeg renders). Model-backed endpoints arrive in M2 (tracking, STT) and M4 (renders); this milestone exposes the health endpoint only.

Run locally from this directory:

```sh
python -m uvicorn app.main:app --reload --port 8000
```

`modal_app.py` (Modal deployment on an L4 or A10G GPU) is added with the first GPU workload in M2.
