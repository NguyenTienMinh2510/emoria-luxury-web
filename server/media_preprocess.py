"""Bounded CPU media preprocessing, isolated from the loaded GPU model."""
import json
import math
import os
from pathlib import Path
import sys
import time
import warnings

MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_EDGE = 8192
MAX_VIDEO_PIXELS = 3840 * 2160
MAX_VIDEO_EDGE = 3840
MAX_VIDEO_SECONDS = 180
MAX_DECODED_FRAMES = 6000
MAX_PREPROCESS_SECONDS = 20

def extract_frames_from_video(video_path, max_frames=16, edge=448):
    import av
    import numpy as np

    started = time.monotonic()
    decoded = 0
    images, times = [], []
    def check(frame=None):
        nonlocal decoded
        decoded += 1
        if decoded > MAX_DECODED_FRAMES or time.monotonic() - started > MAX_PREPROCESS_SECONDS:
            raise ValueError("Video preprocessing budget exceeded")
        if frame is not None and (frame.width * frame.height > MAX_VIDEO_PIXELS or max(frame.width, frame.height) > MAX_VIDEO_EDGE):
            raise ValueError("Video resolution exceeds 4K")
    with av.open(str(video_path)) as container:
        if not container.streams.video:
            raise ValueError("Tệp không có luồng video")
        stream = container.streams.video[0]
        width, height = stream.codec_context.width, stream.codec_context.height
        if width <= 0 or height <= 0 or width * height > MAX_VIDEO_PIXELS or max(width, height) > MAX_VIDEO_EDGE:
            raise ValueError("Video resolution exceeds 4K")
        fps = float(stream.average_rate or 30)
        if not math.isfinite(fps) or not 1 <= fps <= 60 or max_frames < 1 or max_frames > 16 or not 32 <= edge <= 448:
            raise ValueError("Invalid video frame budget")
        start = float((stream.start_time or 0) * stream.time_base)
        duration = float(stream.duration * stream.time_base) if stream.duration else 0
        if not math.isfinite(duration) or duration > MAX_VIDEO_SECONDS:
            raise ValueError("Video duration exceeds 3 minutes")
        if not duration:
            # Missing WebM metadata is allowed only within the same frame/time budget.
            for frame in container.decode(stream):
                check(frame)
                if frame.time is not None:
                    duration = max(duration, float(frame.time) - start + 1 / fps)
                    if duration > MAX_VIDEO_SECONDS:
                        raise ValueError("Video duration exceeds 3 minutes")
        if duration <= 0:
            raise ValueError("Không thể giải mã khung hình video")
        for offset in np.linspace(0, max(0, duration - 1 / fps), max_frames):
            check()
            target = start + float(offset)
            container.seek(int(target / stream.time_base), stream=stream, backward=True)
            selected = None
            for frame in container.decode(stream):
                check(frame)
                if frame.time is not None:
                    selected = frame
                    if float(frame.time) >= target - .5 / fps:
                        break
            if selected is None:
                raise ValueError("Không thể giải mã khung hình video")
            if times and float(selected.time) - start <= times[-1]:
                continue
            scale = min(1., edge / max(selected.width, selected.height))
            w = max(32, round(selected.width * scale / 32) * 32)
            h = max(32, round(selected.height * scale / 32) * 32)
            images.append(selected.reformat(width=w, height=h, format="rgb24").to_ndarray())
            times.append(float(selected.time) - start)
    return np.stack(images), times, fps, duration

def prepare_image(source, destination):
    from PIL import Image
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(source) as image:
            if image.width <= 0 or image.height <= 0 or image.width * image.height > MAX_IMAGE_PIXELS or max(image.size) > MAX_IMAGE_EDGE:
                raise ValueError("Image exceeds 16 megapixels or 8192 pixel edge")
            image.thumbnail((2048, 2048))
            image.convert("RGB").save(destination, format="PNG")

def main():
    # Linux worker limits contain malformed native decoders as well as Python work.
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
    resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
    mode, source, destination = sys.argv[1:4]
    if mode == "image":
        prepare_image(source, destination)
    elif mode == "video":
        import numpy as np
        frames, times, fps, duration = extract_frames_from_video(source)
        np.savez_compressed(destination, frames=frames, times=times, fps=fps, duration=duration)
    else:
        raise ValueError("Invalid media type")

if __name__ == "__main__":
    main()
