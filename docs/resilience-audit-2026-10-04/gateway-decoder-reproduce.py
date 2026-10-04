"""Offline sampler proof: stdlib mocks only; no network, files, GPU or large allocations."""
import ast
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

source = Path(__file__).resolve().parents[2] / 'server' / 'modal_tagger.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'extract_frames_from_video')
namespace = {}
exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)

class Frame:
    def __init__(self, index):
        self.time, self.width, self.height = index / 10, 64, 64
    def reformat(self, **kwargs):
        return self
    def to_ndarray(self):
        return 'small-frame-fixture'

class Container:
    def __init__(self):
        self.streams = SimpleNamespace(video=[SimpleNamespace(average_rate=10, start_time=0, time_base=.1, duration=None)])
        self.pass_counts, self.position = [], 0
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def decode(self, stream):
        counter = [0]
        self.pass_counts.append(counter)
        for index in range(self.position, 1000):
            counter[0] += 1
            yield Frame(index)
    def seek(self, offset, stream, backward):
        self.position = max(0, int(offset) // 10 * 10)

container = Container()
av = SimpleNamespace(open=lambda _: container)
numpy = SimpleNamespace(
    linspace=lambda low, high, count: [low + (high - low) * index / (count - 1) for index in range(count)],
    stack=lambda images: images)
with patch.dict(sys.modules, {'av': av, 'numpy': numpy}):
    images, times, fps, duration = namespace['extract_frames_from_video']('no-file', max_frames=16, edge=64)
assert len(images) == 16
assert container.pass_counts[0][0] == 1000
print({'scenario': 'Unknown duration, 1000 synthetic frames', 'retained_frames': len(images),
       'decoded_frames_in_duration_pass': container.pass_counts[0][0],
       'total_decoded_frames': sum(counter[0] for counter in container.pass_counts),
       'GPU_model_loaded': False, 'network': False})
