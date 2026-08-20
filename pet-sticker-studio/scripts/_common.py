from __future__ import annotations

import json
import sys
from pathlib import Path

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

EXPRESSIONS = [
    ("01", "happy", "开心"), ("02", "laugh", "爆笑"),
    ("03", "aggrieved", "委屈"), ("04", "angry", "生气"),
    ("05", "shocked", "震惊"), ("06", "speechless", "无语"),
    ("07", "received", "收到"), ("08", "thanks", "谢谢"),
    ("09", "love-you", "爱你"), ("10", "good-night", "晚安"),
]


def require_pillow():
    try:
        from PIL import Image, ImageDraw, ImageFont
        return Image, ImageDraw, ImageFont
    except ImportError:
        print("错误：缺少 Pillow。请在当前 Python 环境中安装 Pillow 后重试；脚本不会自动联网安装。", file=sys.stderr)
        raise SystemExit(3)


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fail(message: str, code: int = 2) -> "None":
    print(f"错误：{message}", file=sys.stderr)
    raise SystemExit(code)
