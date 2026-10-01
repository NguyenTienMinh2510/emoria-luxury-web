"""Generate lightweight delivery copies; keep original artwork unchanged. Requires Pillow."""
from pathlib import Path
import math
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
assets = root / "public" / "assets"
products = sorted((assets / "catalog").glob("*.png")) + [assets / "summer_box.png", assets / "product_halo.png"]
original_bytes = optimized_bytes = 0
for source in products:
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        for width in (320, 640, 960):
            copy = image.copy()
            copy.thumbnail((width, width), Image.Resampling.LANCZOS)
            target = assets / "optimized" / f"{source.stem}-{width}.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            copy.save(target, "WEBP", quality=88, method=6)
            if width == 640:
                optimized_bytes += target.stat().st_size
    original_bytes += source.stat().st_size
print(f"Catalog (640px): {original_bytes:,} -> {optimized_bytes:,} bytes")

original_bytes = optimized_bytes = 0
for index in range(120):
    frame = math.floor(index * 299 / 119 + 0.5) + 1
    source = assets / "animation" / f"ezgif-frame-{frame:03}.jpg"
    target = assets / "animation-optimized" / f"frame-{index:03}.webp"
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.thumbnail((1280, 720), Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=88, method=6)
    original_bytes += source.stat().st_size
    optimized_bytes += target.stat().st_size
print(f"All 120 animation frames: {original_bytes:,} -> {optimized_bytes:,} bytes")
