"""Run with the existing video-tagger Python environment; no GPU or Modal calls."""
import ast
import base64
from io import BytesIO
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unicodedata
import weakref
import av
import numpy as np
import torch
from PIL import Image
from transformers import Qwen2VLImageProcessorFast

# Load the sampler without initializing a cloud app or downloading a model.
source = Path(__file__).resolve().parents[1] / 'server' / 'modal_tagger.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
sampler = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'extract_frames_from_video')
namespace = {}
exec(compile(ast.Module(body=[sampler], type_ignores=[]), str(source), 'exec'), namespace)
sample = namespace['extract_frames_from_video']

# Exercise the deployed cap against the pinned native processor, without model weights.
service = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'QwenTagger')
load_model = next(node for node in service.body if isinstance(node, ast.FunctionDef) and node.name == 'load_model')
cap = next(node for node in load_model.body if isinstance(node, ast.Assign)
           and any(ast.unparse(target) == "self.processor.image_processor.size['longest_edge']" for target in node.targets))
processor = Qwen2VLImageProcessorFast(size={'shortest_edge': 65536, 'longest_edge': 16777216},
                                    patch_size=16, merge_size=2, temporal_patch_size=2)
exec(compile(ast.Module(body=[cap], type_ignores=[]), str(source), 'exec'),
     {'self': SimpleNamespace(processor=SimpleNamespace(image_processor=processor))})
assert processor.size == {'shortest_edge': 65536, 'longest_edge': 1048576}
for width, height in [(2048, 2048), (3000, 1600), (1600, 3000)]:
    original = Image.new('RGB', (width, height), (12, 34, 56))
    result = processor(images=[original], return_tensors='pt')
    grid_t, grid_h, grid_w = result.image_grid_thw[0].tolist()
    resized_h, resized_w = grid_h * 16, grid_w * 16
    assert 65536 <= resized_h * resized_w <= 1048576
    assert grid_t * grid_h * grid_w // 4 <= 1024
    assert resized_h % 32 == resized_w % 32 == 0
    assert abs((resized_w / resized_h) / (width / height) - 1) < 0.05
    assert original.size == (width, height) and original.getpixel((0, 0)) == (12, 34, 56)

# Run the real endpoint flow with CPU tensors: an OOM must release inputs before retry.
endpoint = next(node for node in service.body if isinstance(node, ast.FunctionDef) and node.name == 'tag_video')
endpoint.decorator_list = []
unique = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'unique_labels')
endpoint_namespace = {'Path': Path, 'time': time, 'base64': base64, 'json': json,
                      'unicodedata': unicodedata, 'PROMPT': 'Review image'}
exec(compile(ast.Module(body=[endpoint, unique], type_ignores=[]), str(source), 'exec'), endpoint_namespace)
references, cleaned = [], []

class Inputs(dict):
    def to(self, device):
        return self

    @property
    def input_ids(self):
        return self['input_ids']

def prepare(**kwargs):
    inputs = Inputs(input_ids=torch.zeros((1, 8), dtype=torch.long))
    references.append(weakref.ref(inputs.input_ids))
    return inputs

prepare.apply_chat_template = lambda *args, **kwargs: 'prompt'
prepare.batch_decode = lambda *args, **kwargs: ['{"labels":["kỷ niệm"],"violations":[]}']
calls = 0

def generate(**kwargs):
    global calls
    calls += 1
    if calls == 1:
        raise torch.cuda.OutOfMemoryError('test GPU memory exhausted')
    result = torch.zeros((1, 12), dtype=torch.long)
    references.append(weakref.ref(result))
    return result

def empty_cache():
    assert all(reference() is None for reference in references)
    cleaned.append(True)

fake_service = SimpleNamespace(processor=prepare, model=SimpleNamespace(generate=generate))
png = BytesIO()
Image.new('RGB', (32, 32)).save(png, format='PNG')
payload = {'type': 'image', 'video_base64': base64.b64encode(png.getvalue()).decode()}

with tempfile.TemporaryDirectory() as directory:
    for extension, codec, count, width, height, edge, expected in [
        ('mp4', 'libx264', 101, 96, 64, 64, (32, 64, 3)),
        ('webm', 'libvpx-vp9', 21, 96, 64, 64, (32, 64, 3)),
        ('mp4', 'libx264', 1, 96, 64, 64, (32, 64, 3)),
        ('mp4', 'libx264', 3, 1920, 1080, 448, (256, 448, 3)),
    ]:
        path = Path(directory) / f'{count}.{extension}'
        with av.open(str(path), 'w') as output:
            stream = output.add_stream(codec, rate=10)
            stream.width, stream.height, stream.pix_fmt = width, height, 'yuv420p'
            for index in range(count):
                pixels = np.full((height, width, 3), index * 2 % 256, dtype=np.uint8)
                for packet in stream.encode(av.VideoFrame.from_ndarray(pixels, format='rgb24')):
                    output.mux(packet)
            for packet in stream.encode():
                output.mux(packet)
        frames, times, fps, duration = sample(path, max_frames=16, edge=edge)
        assert 1 <= len(frames) <= 16
        assert frames.shape[1:] == expected
        assert max(frames.shape[1:3]) <= edge
        assert times[0] == 0 and times[-1] >= (count - 2) / 10
        assert all(a < b for a, b in zip(times, times[1:]))
        assert abs(duration - count / 10) < 0.2
        assert fps == 10
    endpoint_namespace['tempfile'] = SimpleNamespace(NamedTemporaryFile=lambda **kwargs: tempfile.NamedTemporaryFile(dir=directory, **kwargs))
    real_empty_cache = torch.cuda.empty_cache
    torch.cuda.empty_cache = empty_cache
    try:
        failed = endpoint_namespace['tag_video'](fake_service, payload)
        assert failed['success'] is False and failed['approved'] is False and failed['error_code'] == 'GPU_MEMORY'
        approved = endpoint_namespace['tag_video'](fake_service, payload)
        assert approved['success'] is True and approved['approved'] is True
        assert len(cleaned) == 2 and not list(Path(directory).glob('*.jpg'))
    finally:
        torch.cuda.empty_cache = real_empty_cache
print('PASS native image budget, source/aspect preservation, OOM recovery/cleanup, and bounded MP4/WebM/1080p video sampling.')
