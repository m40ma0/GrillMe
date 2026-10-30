"""SAM 3.1 wrapper: text-prompted UI element tracking (spinners, error dialogs, progress bars, result regions).

The model backend is loaded lazily from SAM_CHECKPOINT. Without it (no GPU, no checkpoint) the tracker reports
itself unavailable and the realtime server falls back to perceptual hashes, as BUILD_PROMPT requires.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

from PIL import Image

log = logging.getLogger("vision.sam")

LABELS = ("spinner", "error_dialog", "progress_bar", "result_region")

# Text prompts per label. SAM is prompted with phrases, not class ids.
PROMPTS: dict[str, str] = {
    "spinner": "loading spinner",
    "error_dialog": "error dialog or error toast message",
    "progress_bar": "progress bar",
    "result_region": "generated result panel with content",
}


@dataclass(frozen=True)
class Region:
    label: str
    box: tuple[float, float, float, float]  # x0, y0, x1, y1 normalised to 0–1
    score: float


class Backend(Protocol):
    """What the tracker needs from a SAM model: boxes and scores for one text prompt on one image."""

    def segment(self, image: Image.Image, prompt: str) -> list[tuple[tuple[float, float, float, float], float]]: ...


class Sam3Backend:
    """Adapter over Meta's SAM 3.x image API (`sam3` package). Imported only when a checkpoint is configured."""

    def __init__(self, checkpoint: str, device: str) -> None:
        from sam3.model.sam3_image_processor import Sam3Processor  # type: ignore[import-not-found]
        from sam3.model_builder import build_sam3_image_model  # type: ignore[import-not-found]

        model = build_sam3_image_model(checkpoint_path=checkpoint, device=device)
        self._processor = Sam3Processor(model)

    def segment(self, image: Image.Image, prompt: str) -> list[tuple[tuple[float, float, float, float], float]]:
        state = self._processor.set_image(image)
        out = self._processor.set_text_prompt(state=state, prompt=prompt)
        boxes = out["boxes"].tolist()
        scores = out["scores"].tolist()
        return [((float(b[0]), float(b[1]), float(b[2]), float(b[3])), float(s)) for b, s in zip(boxes, scores)]


class SamTracker:
    def __init__(self, backend: Backend | None, threshold: float = 0.5) -> None:
        self.backend = backend
        self.threshold = threshold

    @property
    def available(self) -> bool:
        return self.backend is not None

    @classmethod
    def from_settings(cls, checkpoint: str | None, device: str) -> "SamTracker":
        if not checkpoint:
            return cls(None)
        try:
            return cls(Sam3Backend(checkpoint, device))
        except Exception as error:  # noqa: BLE001 - any load failure means "unavailable", logged once
            log.warning("SAM could not load (%s); tracking is unavailable", error)
            return cls(None)

    def track(self, jpeg: bytes, labels: list[str]) -> list[Region]:
        if self.backend is None:
            raise RuntimeError("SAM tracker is not available")
        with Image.open(BytesIO(jpeg)) as raw:
            image = raw.convert("RGB")
        width, height = image.size
        regions: list[Region] = []
        for label in labels:
            if label not in PROMPTS:
                continue
            for (x0, y0, x1, y1), score in self.backend.segment(image, PROMPTS[label]):
                if score < self.threshold:
                    continue
                box = (max(0.0, x0 / width), max(0.0, y0 / height), min(1.0, x1 / width), min(1.0, y1 / height))
                regions.append(Region(label=label, box=box, score=round(score, 3)))
        return regions
