"""Perceptual hashes for frames: the same 9x8 difference hash the browser computes (packages/shared/ws-binary.ts)."""

from io import BytesIO

from PIL import Image


def dhash(image: Image.Image) -> int:
    gray = image.convert("L").resize((9, 8), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    value = 0
    for y in range(8):
        for x in range(8):
            value = (value << 1) | (1 if pixels[y * 9 + x] > pixels[y * 9 + x + 1] else 0)
    return value


def dhash_jpeg(data: bytes) -> int:
    with Image.open(BytesIO(data)) as image:
        return dhash(image)


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")
