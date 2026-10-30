"""Modal deployment of the vision and media service.

Run from services/vision (paths below are relative to it):
    modal serve modal_app.py                  # dev URL, hot reload
    modal deploy modal_app.py                 # stable URL for VISION_SERVICE_URL, on CPU
    MODAL_GPU=L4 modal deploy modal_app.py    # on a GPU (needs a payment method on Modal)

On CPU, speech to text uses faster-whisper base.en (int8); on a GPU, small.en (float16). FFmpeg renders
run on CPU either way. Override the model with WHISPER_MODEL in the secret.

Secrets: create a Modal secret named "stage-ready-vision" with VISION_SERVICE_TOKEN and, once you have
Meta's SAM 3.1 checkpoint, SAM_CHECKPOINT (a path inside the "stage-ready-models" volume).
"""

import os

import modal

# Read when deploying, on your machine.
GPU = os.environ.get("MODAL_GPU") or None
WHISPER = (
    {"WHISPER_DEVICE": "cuda", "WHISPER_COMPUTE_TYPE": "float16", "WHISPER_MODEL": "small.en", "SAM_DEVICE": "cuda"}
    if GPU
    else {"WHISPER_DEVICE": "cpu", "WHISPER_COMPUTE_TYPE": "int8", "WHISPER_MODEL": "base.en", "SAM_DEVICE": "cpu"}
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install_from_requirements("requirements.txt")
    .env(WHISPER)
    .add_local_python_source("app")
)

models = modal.Volume.from_name("stage-ready-models", create_if_missing=True)
app = modal.App("stage-ready-vision", image=image)


@app.function(gpu=GPU, cpu=4.0, memory=8192, volumes={"/models": models}, secrets=[modal.Secret.from_name("stage-ready-vision")], scaledown_window=300, timeout=3600)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def web():
    from app.main import app as fastapi_app

    return fastapi_app
