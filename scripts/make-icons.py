#!/usr/bin/env python3
"""Render the extension icon set from one vector-like definition.

The icon is drawn at 4x with Pillow (Pillow has no anti-aliased vector
primitives), then downsampled with Lanczos so 16 px and 32 px stay crisp.

Run:
    python scripts/make-icons.py
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw

SIZE = 1024
SS = 4
CANVAS = SIZE * SS

BG_TOP = (26, 42, 74)
BG_BOTTOM = (8, 13, 25)
ACCENT_TOP = (104, 180, 255)
ACCENT_BOTTOM = (36, 116, 238)
TEXT_STRONG = (255, 255, 255, 236)
TEXT_SOFT = (255, 255, 255, 150)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")


def s(value: float) -> int:
    return int(round(value * SS))


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    yy = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    xx = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :]
    t = np.clip(yy * 0.72 + xx * 0.28, 0.0, 1.0)[..., None]
    a = np.array(top, dtype=np.float32)[None, None, :]
    b = np.array(bottom, dtype=np.float32)[None, None, :]
    pixels = (a * (1.0 - t) + b * t).astype(np.uint8)
    return Image.fromarray(pixels, "RGB").convert("RGBA")


def rounded_mask(size: tuple[int, int], radius: float) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def pill(box: tuple[float, float, float, float], radius: float, fill: tuple[int, int, int, int]) -> Image.Image:
    """Transparent canvas with a filled rounded rectangle at the given 1024-space box."""
    x0, y0, x1, y1 = (s(v) for v in box)
    layer = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle([0, 0, x1 - x0 - 1, y1 - y0 - 1], radius=s(radius), fill=fill)
    return layer, (x0, y0)


def gradient_pill(
    box: tuple[float, float, float, float],
    radius: float,
    top: tuple[int, int, int],
    bottom: tuple[int, int, int],
    alpha: int = 255,
) -> tuple[Image.Image, tuple[int, int]]:
    x0, y0, x1, y1 = (s(v) for v in box)
    size = (x1 - x0, y1 - y0)
    body = gradient(size, top, bottom)
    mask = rounded_mask(size, s(radius))
    if alpha < 255:
        mask = mask.point(lambda value: int(value * alpha / 255))
    body.putalpha(mask)
    return body, (x0, y0)


def spark(center: tuple[float, float], outer: float, inner: float, fill: tuple[int, int, int, int]) -> Image.Image:
    cx, cy = center
    box = s(outer * 2 + 8)
    layer = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    points = []
    for index in range(8):
        angle = -math.pi / 2 + index * math.pi / 4
        radius = outer if index % 2 == 0 else inner
        points.append((box / 2 + s(radius) * math.cos(angle), box / 2 + s(radius) * math.sin(angle)))
    draw.polygon(points, fill=fill)
    return layer, (s(cx - outer - 4), s(cy - outer - 4))


def build_master() -> Image.Image:
    # Background squircle with a dark navy diagonal gradient.
    background = gradient((CANVAS, CANVAS), BG_TOP, BG_BOTTOM)
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [s(48), s(48), s(976), s(976)], radius=s(228), fill=255
    )
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(background, (0, 0), mask)

    # A soft accent glow behind the highlighted text line.
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(
        [s(110), s(360), s(914), s(760)], fill=(47, 129, 247, 46)
    )
    canvas = Image.alpha_composite(canvas, glow)

    # Highlighted (selected) line.
    bar, position = gradient_pill((196, 452, 828, 604), 76, ACCENT_TOP, ACCENT_BOTTOM)
    canvas.alpha_composite(bar, position)

    # Text lines above and below the selection.
    line_top = Image.new("RGBA", (s(520), s(74)), (0, 0, 0, 0))
    ImageDraw.Draw(line_top).rounded_rectangle(
        [0, 0, s(520) - 1, s(74) - 1], radius=s(37), fill=TEXT_STRONG
    )
    canvas.alpha_composite(line_top, (s(196), s(320)))

    line_bottom = Image.new("RGBA", (s(420), s(74)), (0, 0, 0, 0))
    ImageDraw.Draw(line_bottom).rounded_rectangle(
        [0, 0, s(420) - 1, s(74) - 1], radius=s(37), fill=TEXT_SOFT
    )
    canvas.alpha_composite(line_bottom, (s(196), s(668)))

    # AI spark in the free top-right corner.
    star, star_position = spark((812, 268), 104, 30, (255, 255, 255, 242))
    canvas.alpha_composite(star, star_position)

    return canvas


def save_png(master: Image.Image, size: int, path: str) -> None:
    master.resize((size, size), Image.LANCZOS).save(path, format="PNG", optimize=True)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="AI Inline Assistant">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a2a4a"/>
      <stop offset="1" stop-color="#080d19"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#68b4ff"/>
      <stop offset="1" stop-color="#2474ee"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#2f81f7" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#2f81f7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="48" y="48" width="928" height="928" rx="228" fill="url(#bg)"/>
  <ellipse cx="512" cy="560" rx="402" ry="190" fill="url(#glow)"/>
  <rect x="196" y="452" width="632" height="152" rx="76" fill="url(#accent)"/>
  <rect x="196" y="320" width="520" height="74" rx="37" fill="#ffffff" fill-opacity="0.93"/>
  <rect x="196" y="668" width="420" height="74" rx="37" fill="#ffffff" fill-opacity="0.59"/>
  <path d="M812 164 L838 240 L914 266 L838 292 L812 368 L786 292 L710 266 L786 240 Z" fill="#ffffff" fill-opacity="0.95"/>
</svg>
"""


def main() -> None:
    os.makedirs(ICONS, exist_ok=True)
    master = build_master()
    for size in (16, 32, 48, 128):
        save_png(master, size, os.path.join(ICONS, f"icon{size}.png"))
    save_png(master, 512, os.path.join(ICONS, "icon-master.png"))
    with open(os.path.join(ICONS, "icon.svg"), "w", encoding="utf-8") as handle:
        handle.write(SVG)
    print(f"wrote icons to {ICONS}")


if __name__ == "__main__":
    main()
