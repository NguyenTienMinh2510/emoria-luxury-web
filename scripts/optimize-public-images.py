"""Generate lightweight delivery copies; keep original artwork unchanged. Requires Pillow."""
from pathlib import Path
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

original_bytes = 0
optimized_bytes = {960: 0, 640: 0}
for index in range(300):
    source = assets / "animation" / f"ezgif-frame-{index + 1:03}.jpg"
    with Image.open(source) as image:
        for width, height in ((960, 540), (640, 360)):
            copy = image.copy()
            copy.thumbnail((width, height), Image.Resampling.LANCZOS)
            assert copy.size == (width, height), f"Unexpected frame dimensions: {source}"
            suffix = "" if width == 960 else "-640"
            target = assets / "animation-optimized" / f"frame-{index:03}{suffix}.webp"
            target.parent.mkdir(parents=True, exist_ok=True)
            copy.save(target, "WEBP", quality=88, method=6)
            optimized_bytes[width] += target.stat().st_size
    original_bytes += source.stat().st_size
for width, size in optimized_bytes.items():
    print(f"All 300 animation frames ({width}px): {original_bytes:,} -> {size:,} bytes")
