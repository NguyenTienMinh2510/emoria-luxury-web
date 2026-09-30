"""Run with the existing video-tagger Python environment; no GPU or Modal calls."""
import ast
from pathlib import Path
import tempfile
import av
import numpy as np

# Load the sampler without initializing a cloud app or downloading a model.
source = Path(__file__).resolve().parents[1] / 'server' / 'modal_tagger.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
sampler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'extract_frames_from_video')
namespace = {}
exec(compile(ast.Module(body=[sampler], type_ignores=[]), str(source), 'exec'), namespace)
sample = namespace['extract_frames_from_video']

with tempfile.TemporaryDirectory() as directory:
    for extension, codec, count in [('mp4', 'libx264', 101), ('webm', 'libvpx-vp9', 21), ('mp4', 'libx264', 1)]:
        path = Path(directory) / f'{count}.{extension}'
        with av.open(str(path), 'w') as output:
            stream = output.add_stream(codec, rate=10)
            stream.width, stream.height, stream.pix_fmt = 96, 64, 'yuv420p'
            for index in range(count):
                pixels = np.full((64, 96, 3), index * 2 % 256, dtype=np.uint8)
                for packet in stream.encode(av.VideoFrame.from_ndarray(pixels, format='rgb24')):
                    output.mux(packet)
            for packet in stream.encode():
                output.mux(packet)
        frames, times, fps, duration = sample(path, max_frames=16, edge=64)
        assert 1 <= len(frames) <= 16
        assert frames.shape[1:] == (32, 64, 3)
        assert times[0] == 0 and times[-1] >= (count - 2) / 10
        assert all(a < b for a, b in zip(times, times[1:]))
        assert abs(duration - count / 10) < 0.2
        assert fps == 10
print('PASS bounded video sampling: MP4, WebM without stream duration, last frame, single frame.')
