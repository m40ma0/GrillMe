"""Best-Take Director render: real takes, crossfades, generated title cards, burned captions, -14 LUFS.

Every clip in the output is one of the user's takes. The only generated frames are the intro,
outro and chapter title cards. `demo://` sources are synthetic colour bars used by Demo Mode
fixture takes, and are labelled as such in the frame.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

WIDTH, HEIGHT, FPS, RATE = 1920, 1080, 30, 48_000
TARGET_LUFS = -14.0
# Intermediates are near-lossless and fast; only the final encode uses the requested preset.
INTERMEDIATE = "ultrafast"
FONT_CANDIDATES = [
    os.environ.get("RENDER_FONT", ""),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Clip(Camel):
    source: str = Field(description="http(s) URL of the take, or demo://<label> for a fixture take")
    in_ms: int = Field(ge=0)
    out_ms: int = Field(gt=0)
    chapter: str
    transition: str = Field(default="crossfade", pattern="^(crossfade|cut)$")


class Caption(Camel):
    start_ms: int
    end_ms: int
    text: str


class Card(Camel):
    title: str
    subtitle: str = ""
    #: Optional generated artwork (http(s) URL, e.g. from Muse Image). The text is always drawn here.
    background: str | None = None


class Outputs(Camel):
    """Presigned PUT URLs; when absent the files stay in the job's work dir (tests, local runs)."""

    mp4: str | None = None
    thumbnail: str | None = None


class RenderRequest(Camel):
    clips: list[Clip] = Field(min_length=1)
    captions: list[Caption] = []
    intro: Card
    outro: Card
    crossfade_ms: int = Field(default=200, ge=0)
    card_ms: int = Field(default=2000, gt=0)
    preset: str = "veryfast"
    outputs: Outputs = Outputs()


@dataclass
class RenderJob:
    id: str
    status: str = "queued"
    progress: float = 0.0
    step: str = "Queued"
    error: str | None = None
    duration_ms: int | None = None
    loudness_lufs: float | None = None
    files: dict[str, str] = field(default_factory=dict)

    def public(self) -> dict[str, object]:
        return {
            "id": self.id,
            "status": self.status,
            "progress": round(self.progress, 3),
            "step": self.step,
            "error": self.error,
            "durationMs": self.duration_ms,
            "loudnessLufs": self.loudness_lufs,
        }


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def ffmpeg(*args: str) -> str:
    """Runs ffmpeg and returns stderr (where filters such as loudnorm report)."""
    result = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip().splitlines()[-1] if result.stderr.strip() else result.returncode}")
    return result.stderr


def probe_duration_ms(path: Path) -> int:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()) * 1000)


def card_png(path: Path, title: str, subtitle: str, background: Path | None = None) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), (12, 14, 20))
    if background is not None:
        try:
            with Image.open(background) as art:
                art = art.convert("RGB")
                # Cover-crop to 16:9, then darken so the title reads on any artwork.
                scale = max(WIDTH / art.width, HEIGHT / art.height)
                art = art.resize((max(WIDTH, round(art.width * scale)), max(HEIGHT, round(art.height * scale))))
                left, top = (art.width - WIDTH) // 2, (art.height - HEIGHT) // 2
                image = Image.blend(art.crop((left, top, left + WIDTH, top + HEIGHT)), image, 0.55)
        except OSError:
            pass  # unreadable artwork: keep the plain card
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, HEIGHT - 12, WIDTH, HEIGHT), fill=(99, 102, 241))
    big, small = font(96), font(44)
    draw.text((WIDTH / 2, HEIGHT / 2 - 40), title, font=big, fill=(245, 246, 250), anchor="mm")
    if subtitle:
        draw.text((WIDTH / 2, HEIGHT / 2 + 70), subtitle, font=small, fill=(170, 176, 190), anchor="mm")
    image.save(path)


def chapter_png(path: Path, title: str) -> None:
    """A lower-third chapter label, transparent outside the plate."""
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    label = font(48)
    box = draw.textbbox((0, 0), title, font=label)
    w, h = box[2] - box[0], box[3] - box[1]
    draw.rounded_rectangle((80, 80, 80 + w + 64, 80 + h + 48), radius=16, fill=(12, 14, 20, 200))
    draw.text((112, 104 - box[1]), title, font=label, fill=(245, 246, 250, 255))
    image.save(path)


def fetch(source: str, dest: Path) -> None:
    if not source.startswith(("http://", "https://")):
        raise ValueError(f"Unsupported take source {source!r}.")
    with urllib.request.urlopen(source, timeout=120) as response, dest.open("wb") as out:  # noqa: S310 - presigned storage URLs only
        shutil.copyfileobj(response, out)


def synth_demo(dest: Path, label: str, duration_ms: int) -> None:
    """Demo Mode fixture take: colour bars, the section label, and a speech-like tone. Drawn at 540p; normalize scales it up."""
    w, h = WIDTH // 2, HEIGHT // 2
    text_png = dest.with_suffix(".png")
    image = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(image).text((w / 2, 100), f"Demo Mode fixture take · {label}", font=font(28), fill=(255, 255, 255, 255), anchor="mm", stroke_width=2, stroke_fill=(0, 0, 0, 255))
    image.save(text_png)
    seconds = f"{duration_ms / 1000:.3f}"
    ffmpeg(
        "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate={FPS}:duration={seconds}",
        "-f", "lavfi", "-i", f"sine=frequency=180:sample_rate={RATE}:duration={seconds}",
        "-i", str(text_png),
        "-filter_complex", "[0:v][2:v]overlay=0:0[v];[1:a]volume=0.25,tremolo=f=4:d=0.8,aformat=channel_layouts=stereo[a]",
        "-map", "[v]", "-map", "[a]", "-t", seconds, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", str(dest),
    )  # fmt: skip


def normalize_clip(src: Path, dest: Path, in_ms: int, out_ms: int, chapter: Path, preset: str) -> None:
    """Trims to [in, out], scales and pads to 1080p30, stereo 48 kHz, with the chapter label for 2.5 s."""
    start, length = in_ms / 1000, (out_ms - in_ms) / 1000
    vf = (
        f"[0:v]scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        f"fps={FPS},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration={length:.3f},trim=duration={length:.3f},setpts=PTS-STARTPTS[base];"
        "[1:v]format=rgba[label];[base][label]overlay=0:0:eof_action=pass[v];"
        f"[0:a]aresample={RATE},aformat=channel_layouts=stereo,apad,atrim=duration={length:.3f},asetpts=PTS-STARTPTS[a]"
    )
    ffmpeg("-ss", f"{start:.3f}", "-i", str(src), "-loop", "1", "-framerate", str(FPS), "-t", "2.5", "-i", str(chapter), "-filter_complex", vf, "-map", "[v]", "-map", "[a]", "-t", f"{length:.3f}", "-c:v", "libx264", "-preset", preset, "-crf", "12", "-c:a", "pcm_s16le", str(dest))


def card_clip(png: Path, dest: Path, ms: int, preset: str) -> None:
    seconds = f"{ms / 1000:.3f}"
    ffmpeg(
        "-loop", "1", "-framerate", str(FPS), "-i", str(png), "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate={RATE}",
        "-t", seconds, "-vf", "format=yuv420p,setsar=1", "-c:v", "libx264", "-preset", preset, "-crf", "12", "-c:a", "pcm_s16le", str(dest),
    )  # fmt: skip


def has_audio(path: Path) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return bool(out.stdout.strip())


def ass_time(ms: int) -> str:
    cs = max(0, round(ms / 10))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def write_ass(path: Path, captions: list[Caption]) -> None:
    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Default,DejaVu Sans,56,&H00FFFFFF,&H00000000,&H99000000,1,3,2,0,2,120,120,70\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Text\n"
    )
    lines = [f"Dialogue: 0,{ass_time(c.start_ms)},{ass_time(c.end_ms)},Default,{re.sub(r'[{}\\\\]', '', c.text)}" for c in captions]
    path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")


def measure_loudness(inputs: list[str], graph: str, label: str) -> dict[str, str]:
    analyse = f"{graph};{label}loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json[m]" if graph else f"{label}loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json[m]"
    err = ffmpeg(*inputs, "-filter_complex", analyse, "-map", "[m]", "-f", "null", "-")
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", err, re.S)
    if not match:
        raise RuntimeError("loudnorm did not report measurements.")
    return json.loads(match.group(0))


def integrated_lufs(path: Path) -> float:
    err = ffmpeg("-i", str(path), "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-")
    values = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    if not values:
        raise RuntimeError("ebur128 did not report a loudness.")
    return float(values[-1])


def put(url: str, path: Path, content_type: str) -> None:
    request = urllib.request.Request(url, data=path.read_bytes(), method="PUT", headers={"content-type": content_type})
    with urllib.request.urlopen(request, timeout=300):  # noqa: S310 - presigned storage URL
        pass


CUT_MS = 40  # a "cut" is a 40 ms dissolve so the audio never clicks


def overlaps_ms(req: RenderRequest) -> list[int]:
    """Overlap at each join: into every clip by its transition, into the outro always a crossfade."""
    return [CUT_MS if c.transition == "cut" else req.crossfade_ms for c in req.clips] + [req.crossfade_ms]


def expected_ms(req: RenderRequest) -> int:
    return 2 * req.card_ms + sum(c.out_ms - c.in_ms for c in req.clips) - sum(overlaps_ms(req))


def render(req: RenderRequest, work: Path, report: Callable[[float, str], None]) -> dict[str, object]:
    """Renders into `work`; returns paths, the measured duration and loudness."""
    parts: list[Path] = []
    steps = len(req.clips) + 5

    for name, card in (("intro", req.intro), ("outro", req.outro)):
        art = None
        if card.background:
            try:
                art = work / f"{name}-art"
                fetch(card.background, art)
            except Exception:  # noqa: BLE001 - artwork is optional; the plain card is the fallback
                art = None
        card_png(work / f"{name}.png", card.title, card.subtitle, art)
    card_clip(work / "intro.png", work / "intro.mkv", req.card_ms, INTERMEDIATE)
    parts.append(work / "intro.mkv")
    report(1 / steps, "Title cards ready")

    for i, clip in enumerate(req.clips):
        src = work / f"src{i}.mkv"
        if clip.source.startswith("demo://"):
            synth_demo(src, clip.source.removeprefix("demo://"), clip.out_ms)
        else:
            fetch(clip.source, src)
            if not has_audio(src):
                silent = work / f"src{i}a.mkv"
                ffmpeg("-i", str(src), "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate={RATE}", "-shortest", "-c:v", "copy", "-c:a", "pcm_s16le", str(silent))
                src = silent
        chapter_png(work / f"chapter{i}.png", clip.chapter)
        normalize_clip(src, work / f"clip{i}.mkv", clip.in_ms, clip.out_ms, work / f"chapter{i}.png", INTERMEDIATE)
        parts.append(work / f"clip{i}.mkv")
        report((2 + i) / steps, f"Prepared {clip.chapter}")

    card_clip(work / "outro.png", work / "outro.mkv", req.card_ms, INTERMEDIATE)
    parts.append(work / "outro.mkv")

    # Crossfade chain: each xfade starts `fade` before the end of everything so far.
    durations = [req.card_ms / 1000] + [(c.out_ms - c.in_ms) / 1000 for c in req.clips] + [req.card_ms / 1000]
    inputs: list[str] = []
    for p in parts:
        inputs += ["-i", str(p)]
    graph: list[str] = []
    v_prev, a_prev, elapsed = "[0:v]", "[0:a]", durations[0]
    for i, overlap in enumerate(overlaps_ms(req), start=1):
        fade = overlap / 1000
        offset = elapsed - fade
        graph.append(f"{v_prev}[{i}:v]xfade=transition=fade:duration={fade:.3f}:offset={offset:.3f}[v{i}]")
        graph.append(f"{a_prev}[{i}:a]acrossfade=d={fade:.3f}:c1=tri:c2=tri[a{i}]")
        v_prev, a_prev = f"[v{i}]", f"[a{i}]"
        elapsed = offset + durations[i]
    # Pass 1 measures the crossfaded audio only; pass 2 is the single video encode.
    audio_graph = ";".join(g for g in graph if "acrossfade" in g)
    m = measure_loudness(inputs, audio_graph, a_prev)
    report((steps - 2) / steps, "Measured loudness")
    write_ass(work / "captions.ass", req.captions)
    norm = f"loudnorm=I={TARGET_LUFS}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    final = ";".join([*graph, f"{v_prev}ass={work / 'captions.ass'}[vout]", f"{a_prev}{norm},aresample={RATE}[aout]"])
    mp4 = work / "video.mp4"
    ffmpeg(
        *inputs, "-filter_complex", final, "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", req.preset, "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(mp4),
    )  # fmt: skip
    report((steps - 1) / steps, "Encoded MP4")

    thumb = work / "thumbnail.png"
    first_clip_at = req.card_ms / 1000 + 1.0
    ffmpeg("-ss", f"{first_clip_at:.3f}", "-i", str(mp4), "-frames:v", "1", str(thumb))
    return {"mp4": mp4, "thumbnail": thumb, "durationMs": probe_duration_ms(mp4), "loudnessLufs": integrated_lufs(mp4)}


class Renderer:
    """Runs renders on background threads; jobs are polled by id."""

    def __init__(self, root: Path | None = None, workers: int = 1) -> None:
        self.root = root or Path(tempfile.gettempdir()) / "stage-ready-render"
        self.root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, RenderJob] = {}
        self.slots = threading.Semaphore(workers)

    def submit(self, req: RenderRequest) -> RenderJob:
        job = RenderJob(id=uuid.uuid4().hex)
        self.jobs[job.id] = job
        threading.Thread(target=self._run, args=(job, req), daemon=True).start()
        return job

    def _run(self, job: RenderJob, req: RenderRequest) -> None:
        with self.slots:
            work = self.root / job.id
            work.mkdir(parents=True, exist_ok=True)
            job.status = "running"

            def report(pct: float, step: str) -> None:
                job.progress, job.step = min(0.99, pct), step

            try:
                result = render(req, work, report)
                job.duration_ms = int(result["durationMs"])  # type: ignore[arg-type]
                job.loudness_lufs = round(float(result["loudnessLufs"]), 2)  # type: ignore[arg-type]
                job.files = {"mp4": str(result["mp4"]), "thumbnail": str(result["thumbnail"])}
                if req.outputs.mp4:
                    job.step = "Uploading"
                    put(req.outputs.mp4, Path(job.files["mp4"]), "video/mp4")
                if req.outputs.thumbnail:
                    put(req.outputs.thumbnail, Path(job.files["thumbnail"]), "image/png")
                if req.outputs.mp4:
                    shutil.rmtree(work, ignore_errors=True)
                job.status, job.progress, job.step = "done", 1.0, "Done"
            except Exception as error:  # noqa: BLE001 - reported through the job
                job.status, job.error = "failed", str(error)
                shutil.rmtree(work, ignore_errors=True)
