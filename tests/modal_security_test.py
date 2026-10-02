"""Offline tests of the deployed downloader; stdlib only, no cloud/GPU/network."""
import ast
import base64
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch

source = Path(__file__).resolve().parents[1] / 'server' / 'modal_tagger.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
service = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'QwenTagger')
endpoints = [node for node in service.body if isinstance(node, ast.FunctionDef)
             and any(isinstance(decorator, ast.Call) and ast.unparse(decorator.func) == 'modal.fastapi_endpoint'
                     for decorator in node.decorator_list)]
assert len(endpoints) == 4
for endpoint in endpoints:
    decorator = next(decorator for decorator in endpoint.decorator_list
                     if isinstance(decorator, ast.Call) and ast.unparse(decorator.func) == 'modal.fastapi_endpoint')
    assert any(keyword.arg == 'requires_proxy_auth' and ast.literal_eval(keyword.value) is True
               for keyword in decorator.keywords), endpoint.name

selected = [node for node in tree.body if isinstance(node, ast.FunctionDef)
            and node.name in ('validate_media_url', 'decode_media_base64', 'download_media')]
limit = next(node for node in tree.body if isinstance(node, ast.Assign)
             and any(isinstance(target, ast.Name) and target.id == 'MAX_MEDIA_BYTES' for target in node.targets))
namespace = {'os': os, 'base64': base64, 'time': time}
exec(compile(ast.Module(body=[limit, *selected], type_ignores=[]), str(source), 'exec'), namespace)
assert namespace['MAX_MEDIA_BYTES'] == 50 * 1024 * 1024
origin = 'https://offline-fixture.supabase.co'
signed = origin + '/storage/v1/object/sign/emoria-memory/owner/photo.jpg?token=offline.jwt.signature'

def rejects(action):
    try:
        action()
    except (ValueError, base64.binascii.Error):
        return
    raise AssertionError('Expected rejection')

calls = []
response = None

class Response:
    def __init__(self, status=200, headers=None, chunks=(b'1234', b'5678')):
        self.status_code, self.headers, self.chunks = status, headers or {}, chunks

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def raise_for_status(self):
        assert self.status_code == 200

    def iter_content(self, chunk_size):
        assert chunk_size <= 1024 * 1024
        yield from self.chunks

def get(url, **options):
    calls.append((url, options))
    return response

with patch.dict(os.environ, {'MODAL_STORAGE_ORIGIN': origin}), \
        patch.dict(sys.modules, {'requests': SimpleNamespace(get=get)}), tempfile.TemporaryDirectory() as directory:
    target = Path(directory) / 'download.jpg'
    assert namespace['validate_media_url'](signed) == signed
    assert namespace['validate_media_url'](signed.replace('emoria-memory', 'emoria-event-media'))
    for url in [
        'http://127.0.0.1:9/private', 'http://169.254.169.254/latest/meta-data',
        'https://evil.example/private', signed.replace('offline-fixture', 'another-project'),
        signed.replace('.supabase.co/', '.supabase.co:443/'),
        signed.replace('https://', 'https://secret@'),
        signed.replace('emoria-memory', 'private-bucket'),
        signed.replace('/object/sign/', '/object/public/'),
        signed.replace('/photo.jpg', '/../private'), signed.replace('/photo.jpg', '/%2e%2e/private'),
        signed.replace('/photo.jpg', '/photo%2fprivate'), signed.replace('/photo.jpg', '/photo%252fprivate'),
        signed.replace('/photo.jpg', '/photo%5cprivate'), signed + '#private', signed + '&token=second',
        signed.replace('?token=offline.jwt.signature', '?token='), signed + '&redirect=http://127.0.0.1',
    ]:
        rejects(lambda: namespace['download_media'](url, target))
    assert not calls and not target.exists(), 'Untrusted URLs must fail before any HTTP/file access'
    with patch.dict(os.environ, {'MODAL_STORAGE_ORIGIN': ''}):
        rejects(lambda: namespace['download_media'](signed, target))
    assert not calls

    # A small cap exercises both boundaries without allocating a 50 MB fixture.
    namespace['MAX_MEDIA_BYTES'] = 8
    for status in (301, 302, 307, 308):
        response = Response(status=status)
        rejects(lambda: namespace['download_media'](signed, target))
        assert not target.exists(), 'Redirect responses cannot write media or follow the next URL'
    assert all(options['allow_redirects'] is False and options['stream'] is True
               and options['timeout'] == (10, 30) for _, options in calls)
    response = Response(headers={'Content-Length': '9'})
    rejects(lambda: namespace['download_media'](signed, target))
    assert not target.exists()
    response = Response(chunks=(b'12345', b'6789'))
    rejects(lambda: namespace['download_media'](signed, target))
    assert target.read_bytes() == b'12345', 'An oversized streamed chunk is rejected before writing'
    response = Response(headers={'Content-Length': '8'})
    namespace['download_media'](signed, target)
    assert target.read_bytes() == b'12345678'
    response = Response(chunks=(b'x',))
    namespace['time'] = SimpleNamespace(monotonic=iter((0, 61)).__next__)
    rejects(lambda: namespace['download_media'](signed, target))
    assert target.read_bytes() == b'', 'Slow streaming is bounded'

    assert namespace['decode_media_base64'](base64.b64encode(b'12345678').decode()) == b'12345678'
    for value in ('', 'not base64!', '====', base64.b64encode(b'123456789').decode(), base64.b64encode(b'1234567890').decode()):
        rejects(lambda: namespace['decode_media_base64'](value))
    with patch.object(base64, 'b64decode', side_effect=AssertionError('Oversized input must not decode')):
        rejects(lambda: namespace['decode_media_base64']('A' * 16))

print('PASS all 4 endpoints require native proxy auth; project/bucket signed URL allowlist; zero SSRF requests; redirects, stream size/deadline and base64 size bounded.')
