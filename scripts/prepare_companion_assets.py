#!/usr/bin/env python3
"""
Prepares Aemeath companion artwork for the Astra web application.

The source artwork is licensed by its owner and is NOT committed to the
repository. This script takes artwork the user already owns, removes the
background, and writes transparent PNG assets into the companion asset root
so the web renderer can load them locally.

Usage:
    python3 scripts/prepare_companion_assets.py \
        --source "/path/to/aemeath-icon.png" \
        [--source "/path/to/another.png"] \
        [--out packages/web/public/assets/companion/aemeath]

Nothing is downloaded from the internet; only local files are read.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError:  # pragma: no cover - dependency guard
    print("Pillow is required: pip install pillow", file=sys.stderr)
    raise SystemExit(2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", action="append", required=True, dest="sources", help="Local source image (repeatable)")
    parser.add_argument("--out", required=True, help="Output directory for the generated assets")
    parser.add_argument("--size", type=int, default=768, help="Longest edge of the generated portrait")
    parser.add_argument("--tolerance", type=int, default=42, help="Corner colour tolerance for background removal")
    parser.add_argument("--feather", type=int, default=2, help="Edge feather radius in pixels")
    return parser.parse_args()


def remove_background(image: Image.Image, tolerance: int, feather: int) -> Image.Image:
    """Removes a flat border colour by turning near-matching pixels transparent."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()

    samples = [
        pixels[0, 0],
        pixels[width - 1, 0],
        pixels[0, height - 1],
        pixels[width - 1, height - 1],
    ]
    reference = tuple(sum(sample[channel] for sample in samples) // 4 for channel in range(3))

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            distance = abs(red - reference[0]) + abs(green - reference[1]) + abs(blue - reference[2])
            if distance < tolerance * 3:
                pixels[x, y] = (red, green, blue, 0)

    if feather > 0:
        alpha_channel = rgba.getchannel("A")
        alpha_channel = alpha_channel.filter(ImageFilter.GaussianBlur(radius=feather))
        rgba.putalpha(alpha_channel)
    return rgba


def fit(image: Image.Image, size: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((size, size), Image.LANCZOS)
    return copy


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out)
    (out_dir / "portrait").mkdir(parents=True, exist_ok=True)
    (out_dir / "sprite").mkdir(parents=True, exist_ok=True)
    (out_dir / "halo").mkdir(parents=True, exist_ok=True)

    generated: list[Path] = []
    for index, source in enumerate(args.sources):
        source_path = Path(source).expanduser()
        if not source_path.is_file():
            print(f"skip (missing): {source_path}", file=sys.stderr)
            continue
        image = Image.open(source_path)
        cleaned = remove_background(image, args.tolerance, args.feather)
        resized = fit(cleaned, args.size)
        target = out_dir / "portrait" / ("aemeath-portrait.png" if index == 0 else f"aemeath-portrait-{index + 1}.png")
        resized.save(target, "PNG", optimize=True)
        generated.append(target)
        print(f"wrote {target} ({resized.width}x{resized.height})")

    if not generated:
        print("no assets were produced", file=sys.stderr)
        return 1

    manifest = out_dir / "ASSETS.md"
    lines = [
        "# Aemeath companion assets",
        "",
        "These files are derived from artwork you own and are intentionally not committed.",
        "Regenerate them with `scripts/prepare_companion_assets.py`.",
        "",
    ]
    lines.extend(f"- `{path.relative_to(out_dir)}`" for path in generated)
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
