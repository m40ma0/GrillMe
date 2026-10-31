import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    token: str | None
    #: Production: refuse every request while VISION_SERVICE_TOKEN is unset, instead of serving anyone.
    require_token: bool
    whisper_model: str
    whisper_device: str
    whisper_compute: str
    sam_checkpoint: str | None
    sam_device: str


def settings() -> Settings:
    return Settings(
        token=os.environ.get("VISION_SERVICE_TOKEN") or None,
        require_token=os.environ.get("VISION_REQUIRE_TOKEN", "").lower() in ("1", "true", "yes"),
        whisper_model=os.environ.get("WHISPER_MODEL", "tiny.en"),
        whisper_device=os.environ.get("WHISPER_DEVICE", "auto"),
        whisper_compute=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        sam_checkpoint=os.environ.get("SAM_CHECKPOINT") or None,
        sam_device=os.environ.get("SAM_DEVICE", "cuda"),
    )
