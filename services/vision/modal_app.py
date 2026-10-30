"""Modal deployment of the vision and media service on a GPU (L4 by default; A10G also works).

Run from services/vision (paths below are relative to it):
    modal serve modal_app.py     # dev URL, hot reload
    modal deploy modal_app.py    # stable URL for VISION_SERVICE_URL

Secrets: create a Modal secret named "stage-ready-vision" with VISION_SERVICE_TOKEN and, once you have
Meta's SAM 3.1 checkpoint, SAM_CHECKPOINT (a path inside the "stage-ready-models" volume).
"""

import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install_from_requirements("requirements.txt")
    .env({"WHISPER_DEVICE": "cuda", "WHISPER_COMPUTE_TYPE": "float16", "WHISPER_MODEL": "small.en", "SAM_DEVICE": "cuda"})
    .add_local_python_source("app")
)

models = modal.Volume.from_name("stage-ready-models", create_if_missing=True)
app = modal.App("stage-ready-vision", image=image)


@app.function(gpu="L4", volumes={"/models": models}, secrets=[modal.Secret.from_name("stage-ready-vision")], scaledown_window=300, timeout=3600)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    from app.main import app as fastapi_app

    return fastapi_app
