import os
import math
import json
import base64
import tempfile
import time
import unicodedata
import subprocess
from pathlib import Path

import modal

# 1. Khởi tạo Modal App và Volume Cache để lưu trọng số model
app = modal.App("emoria-qwen-tagger")
model_volume = modal.Volume.from_name("emoria-qwen-cache", create_if_missing=True)

# 2. Định nghĩa môi trường container chạy trên đám mây Modal
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.5.1",
        "torchvision==0.20.1",
        index_url="https://download.pytorch.org/whl/cu124",
    )
    .pip_install(
        "transformers==4.57.1",
        "accelerate>=1.10.0,<2",
        "bitsandbytes>=0.48.1",
        "av>=16.0.0",
        "numpy>=2.0.0,<3",
        "Pillow>=11.0.0",
        "fastapi[standard]",
        "requests",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "0",
        "HF_HOME": "/cache/huggingface",
        # Public project origin, supplied by the deployment environment.
        "MODAL_STORAGE_ORIGIN": os.environ.get("MODAL_STORAGE_ORIGIN") or os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "",
    })
    .add_local_file(str(Path(__file__).with_name("media_preprocess.py")), "/opt/emoria/media_preprocess.py")
)

MODEL_NAME = "Qwen/Qwen3-VL-4B-Instruct"
MAX_MEDIA_BYTES = 50 * 1024 * 1024

def preprocess_media(kind, source, destination):
    import sys
    helper = Path("/opt/emoria/media_preprocess.py")
    if not helper.exists():
        helper = Path(__file__).with_name("media_preprocess.py")
    environment = dict(os.environ, OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1")
    result = subprocess.run([sys.executable, str(helper), kind, str(source), str(destination)],
                            timeout=25, capture_output=True, env=environment)
    if result.returncode:
        diagnostic = result.stderr.decode("utf-8", errors="replace")
        if any(word in diagnostic for word in ("exceeds", "budget exceeded", "DecompressionBomb", "Invalid video")):
            raise ValueError("Media exceeds the supported processing limits")
        raise RuntimeError("Media preprocessing failed")


def validate_media_url(value):
    import re
    from urllib.parse import urlsplit, unquote, parse_qs

    origin = urlsplit(os.environ.get("MODAL_STORAGE_ORIGIN", ""))
    if (origin.scheme != "https" or not re.fullmatch(r"[a-z0-9-]+\.supabase\.co", origin.netloc)
            or origin.path not in ("", "/") or origin.query or origin.fragment):
        raise ValueError("Storage origin is not configured")
    if not isinstance(value, str) or len(value) > 8192 or any(ord(char) < 32 for char in value):
        raise ValueError("Invalid media URL")
    url = urlsplit(value)
    if url.scheme != "https" or url.netloc != origin.netloc or url.fragment:
        raise ValueError("Invalid media URL")
    parts = url.path.split("/")
    if (parts[:5] != ["", "storage", "v1", "object", "sign"] or len(parts) < 7
            or parts[5] not in ("emoria-memory", "emoria-event-media")):
        raise ValueError("Invalid media URL")
    for part in parts[6:]:
        decoded = unquote(part)
        if (not decoded or decoded in (".", "..") or any(char in decoded for char in ("/", "\\", "%"))
                or any(ord(char) < 32 for char in decoded)):
            raise ValueError("Invalid media URL")
    query = parse_qs(url.query, keep_blank_values=True)
    if (set(query) != {"token"} or len(query["token"]) != 1
            or not re.fullmatch(r"[A-Za-z0-9._-]{1,4096}", query["token"][0])):
        raise ValueError("A signed Storage URL is required")
    return value


def decode_media_base64(value):
    if not isinstance(value, str) or not value or len(value) > 4 * ((MAX_MEDIA_BYTES + 2) // 3):
        raise ValueError("Invalid media or media exceeds 50 MB")
    data = base64.b64decode(value, validate=True)
    if not data or len(data) > MAX_MEDIA_BYTES:
        raise ValueError("Invalid media or media exceeds 50 MB")
    return data


def download_media(value, path):
    import requests

    url = validate_media_url(value)
    started = time.monotonic()
    with requests.get(url, timeout=(10, 30), stream=True, allow_redirects=False) as response:
        if 300 <= response.status_code < 400:
            raise ValueError("Media redirects are not allowed")
        response.raise_for_status()
        length = response.headers.get("Content-Length")
        if length is not None and (not length.isdigit() or int(length) > MAX_MEDIA_BYTES):
            raise ValueError("Invalid media or media exceeds 50 MB")
        size = 0
        with open(path, "wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                size += len(chunk)
                if size > MAX_MEDIA_BYTES or time.monotonic() - started > 60:
                    raise ValueError("Media exceeds the download limit")
                output.write(chunk)
        if not size:
            raise ValueError("Empty media")

PROMPT = (
    'Xem kỹ video/hình ảnh kỷ niệm này và thực hiện 2 nhiệm vụ: '
    '1. Trích xuất từ 4 đến 6 từ khóa (hashtag) tiếng Việt ngắn, cụ thể mô tả: '
    'nhân vật, trang sức/trang phục, hoạt động, bối cảnh và cảm xúc (ví dụ: "nhẫn đính hôn", '
    '"áo dài", "bờ biển", "nụ cười hạnh phúc", "kỷ niệm ngày cưới"). '
    '2. Kiểm duyệt an toàn: Nếu phát hiện nội dung đồi trụy hoặc bạo lực nghiêm trọng, thêm mã vi phạm '
    'vào mảng "violations" (ví dụ: "SEXUAL_EXPLICIT", "GRAPHIC_VIOLENCE"). '
    'Chỉ trả về duy nhất một chuỗi JSON hợp lệ theo định dạng: '
    '{"labels": ["nhãn 1", "nhãn 2"], "violations": []}. '
    'Tuyệt đối không kèm lời giải thích, không bọc markdown codeblock.'
)

def unique_labels(labels, max_labels=8):
    cleaned = []
    seen = set()
    for item in labels:
        if not isinstance(item, str):
            continue
        norm = unicodedata.normalize("NFC", " ".join(item.split())).strip()
        lower = norm.lower()
        if lower and lower not in seen and len(norm) <= 40:
            seen.add(lower)
            cleaned.append(norm)
    return cleaned[:max_labels]

def extract_frames_from_video(video_path, max_frames=16, edge=448):
    # Compatibility entry point; production uses the same bounded helper in a child process.
    try:
        from media_preprocess import extract_frames_from_video as bounded
    except ImportError:
        from server.media_preprocess import extract_frames_from_video as bounded
    return bounded(video_path, max_frames=max_frames, edge=edge)

# 3. Class Service chạy mô hình Qwen trên GPU đám mây
@app.cls(
    gpu="T4",
    image=image,
    volumes={"/cache": model_volume},
    timeout=150,
    max_containers=2,
    scaledown_window=600, # Giữ GPU thức 10 phút sau lượt chạy để phản hồi tức thì các lượt tiếp theo
)
class QwenTagger:
    @modal.enter()
    def load_model(self):
        import torch
        from transformers import AutoProcessor, BitsAndBytesConfig, Qwen3VLForConditionalGeneration

        print(f"Khởi động Qwen3-VL trên GPU: {torch.cuda.get_device_name(0)}...")
        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)
        # ponytail: 1024 image tokens suit T4; raise the budget after measuring VRAM.
        self.processor.image_processor.size["longest_edge"] = 1024 * 32 * 32
        quant = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        self.model = Qwen3VLForConditionalGeneration.from_pretrained(
            MODEL_NAME,
            quantization_config=quant,
            device_map={"": 0},
            dtype=torch.float16,
            attn_implementation="sdpa",
        ).eval()
        print("Đã nạp model Qwen3-VL-4B-Instruct sẵn sàng vào VRAM!")

    def generate_letter_text(self, payload: dict):
        import torch

        for field, limit in (("recipient", 120), ("author", 120), ("memoryHint", 1000),
                             ("occasion", 40), ("tone", 40), ("language", 2)):
            if field in payload and (not isinstance(payload[field], str) or len(payload[field]) > limit):
                raise ValueError("Invalid letter input")

        occasion = payload.get("occasion", "anniversary")
        tone = payload.get("tone", "romantic")
        recipient = payload.get("recipient", "Người thương")
        author = payload.get("author", "Người gửi")
        memory_hint = payload.get("memoryHint", "")
        language = payload.get("language", "vi")

        prompt = (
            "You are an expert master poet and personal letter crafter for Emoria Luxury Jewelry.\n"
            "Write a heartfelt, elegant, and deeply moving letter to accompany a fine jewelry keepsake gift.\n"
            f"- Occasion: {occasion}\n"
            f"- Tone: {tone}\n"
            f"- Recipient name: {recipient}\n"
            f"- Author name: {author}\n"
            f"- Personal memory/details: {memory_hint or 'None specified'}\n"
            f"- Language: English. Length: 120-220 words.\n"
            "Output only the finished letter with salutation and sign-off. No conversational filler or commentary."
        ) if language == "en" else (
            "Bạn là nhà văn và chuyên gia chắp bút thư tình cảm xúc cao cấp cho thương hiệu trang sức kim hoàn Emoria.\n"
            "Hãy viết một lá thư tay sâu sắc, sang trọng, xúc động và chân thành để người tặng gửi gắm kèm theo chiếc trang sức kỷ vật.\n"
            f"- Dịp tặng: {occasion}\n"
            f"- Tông giọng cảm xúc: {tone}\n"
            f"- Người nhận: {recipient}\n"
            f"- Người gửi: {author}\n"
            f"- Kỷ niệm gợi ý: {memory_hint or 'Tự do sáng tác chân thành'}\n"
            "- Độ dài: Khoảng 120-220 từ. Văn phong tiếng Việt tinh tế, sang trọng, giàu hình ảnh và chạm đến trái tim.\n"
            "Chỉ trả về toàn văn lá thư (gồm lời mở đầu và lời kết ký tên). Tuyệt đối không thêm lời dẫn giải của AI, không bọc markdown code block."
        )

        prompt_text = self.processor.apply_chat_template(
            [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = self.processor(text=[prompt_text], return_tensors="pt").to("cuda:0")

        with torch.inference_mode():
            generated = self.model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                repetition_penalty=1.1,
            )

        raw = self.processor.batch_decode(
            generated[:, inputs.input_ids.shape[1]:],
            skip_special_tokens=True,
        )[0].strip()

        if raw.startswith("```"):
            lines = raw.split("\n")
            if len(lines) > 2 and lines[-1].startswith("```"):
                raw = "\n".join(lines[1:-1]).strip()

        return {
            "success": True,
            "letter": raw,
            "model": MODEL_NAME,
        }

    @modal.fastapi_endpoint(method="GET", requires_proxy_auth=True)
    def warmup(self):
        return {"success": True, "status": "ready", "model": MODEL_NAME}

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def warmup_post(self, payload: dict = None):
        return {"success": True, "status": "ready", "model": MODEL_NAME}

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def craft_letter(self, payload: dict):
        try:
            return self.generate_letter_text(payload)
        except Exception as e:
            return {"success": False, "error": "Letter generation failed"}

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def tag_video(self, payload: dict):
        import torch
        import numpy as np
        from PIL import Image
        started = time.monotonic()
        stage = "download"

        # Nếu payload là yêu cầu warmup đánh thức container
        if payload.get("task") == "warmup" or payload.get("type") == "warmup":
            return {"success": True, "status": "ready", "model": MODEL_NAME}

        # Nếu payload là yêu cầu viết thư tay
        if payload.get("task") == "letter" or payload.get("type") == "letter" or "occasion" in payload:
            try:
                return self.generate_letter_text(payload)
            except Exception as e:
                return {"success": False, "error": "Letter generation failed"}

        video_url = payload.get("url")
        video_base64 = payload.get("video_base64")
        media_type = payload.get("type", "video") # 'video' hoặc 'image'

        if media_type not in ("video", "image") or bool(video_url) == bool(video_base64):
            return {"success": False, "approved": False, "error": "Invalid media input", "labels": [], "violations": []}

        with tempfile.NamedTemporaryFile(suffix=".mp4" if media_type == "video" else ".jpg", delete=False) as tmp:
            tmp_path = Path(tmp.name)

        inputs = generated = None
        input_tokens = 0
        try:
            if video_url:
                download_media(video_url, tmp_path)
            else:
                data = decode_media_base64(video_base64)
                with open(tmp_path, "wb") as f:
                    f.write(data)

            downloaded = time.monotonic()
            stage = "preprocess"
            if media_type == "image" or tmp_path.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                # Xử lý ảnh tĩnh
                prepared_path = tmp_path.with_suffix(".review.png")
                preprocess_media("image", tmp_path, prepared_path)
                pil_img = Image.open(prepared_path).convert("RGB")
                prompt_text = self.processor.apply_chat_template(
                    [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}],
                    tokenize=False,
                    add_generation_prompt=True,
                )
                inputs = self.processor(text=[prompt_text], images=[pil_img], return_tensors="pt").to("cuda:0")
            else:
                # Xử lý video động
                prepared_path = tmp_path.with_suffix(".review.npz")
                preprocess_media("video", tmp_path, prepared_path)
                with np.load(prepared_path, allow_pickle=False) as reviewed:
                    images = reviewed["frames"]
                    times = reviewed["times"].tolist()
                    fps, duration = float(reviewed["fps"]), float(reviewed["duration"])
                metadata = {
                    "fps": fps,
                    "total_num_frames": max(len(images), round(duration * fps)),
                    "duration": duration,
                    "frames_indices": [round(t * fps) for t in times],
                }
                prompt_text = self.processor.apply_chat_template(
                    [{"role": "user", "content": [{"type": "video"}, {"type": "text", "text": PROMPT}]}],
                    tokenize=False,
                    add_generation_prompt=True,
                )
                inputs = self.processor(
                    text=[prompt_text],
                    videos=[images],
                    video_metadata=[metadata],
                    do_sample_frames=False,
                    do_resize=False,
                    return_tensors="pt",
                ).to("cuda:0")

            prepared = time.monotonic()
            input_tokens = int(inputs.input_ids.shape[-1])
            stage = "inference"
            with torch.inference_mode():
                generated = self.model.generate(
                    **inputs,
                    max_new_tokens=256,
                    do_sample=False,
                    repetition_penalty=1.15,
                )

            raw = self.processor.batch_decode(
                generated[:, inputs.input_ids.shape[1]:],
                skip_special_tokens=True,
            )[0].strip()

            # Parse JSON kết quả
            cleaned = raw
            if "```" in cleaned:
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
                cleaned = cleaned.strip()

            stage = "parse"
            parsed = json.loads(cleaned)
            if not isinstance(parsed, dict) or not isinstance(parsed.get("labels"), list) or not isinstance(parsed.get("violations"), list):
                raise ValueError("Incomplete moderation JSON")
            labels = unique_labels(parsed["labels"])
            violations = parsed["violations"]
            print(json.dumps({"event": "media_review", "type": media_type,
                              "input_tokens": input_tokens,
                              "download_s": round(downloaded - started, 2),
                              "preprocess_s": round(prepared - downloaded, 2),
                              "inference_s": round(time.monotonic() - prepared, 2)}))

            return {
                "success": True,
                "approved": len(violations) == 0,
                "labels": labels,
                "violations": violations,
                "model": "Qwen/Qwen3-VL-4B-Instruct",
            }

        except Exception as e:
            print(json.dumps({"event": "media_review_failed", "stage": stage, "type": media_type,
                              "input_tokens": input_tokens,
                              "error_type": type(e).__name__, "elapsed_s": round(time.monotonic() - started, 2)}))
            return {
                "success": False,
                "approved": False,
                "error_code": "GPU_MEMORY" if isinstance(e, torch.cuda.OutOfMemoryError) else "MEDIA_LIMIT" if isinstance(e, ValueError) else "MEDIA_PROCESSING",
                "error": "Media processing failed",
                "labels": [],
                "violations": [],
            }
        finally:
            inputs = generated = None
            torch.cuda.empty_cache()
            if tmp_path.exists():
                tmp_path.unlink()
            for extension in (".review.png", ".review.npz"):
                tmp_path.with_suffix(extension).unlink(missing_ok=True)
