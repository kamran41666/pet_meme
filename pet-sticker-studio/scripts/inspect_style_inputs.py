#!/usr/bin/env python3
"""检查风格参考图片并生成稳定编号清单。"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import fail, require_pillow, write_json

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 3–12 张风格参考图的格式、尺寸和损坏情况；视觉风格仍由 Codex 查看。")
    parser.add_argument("input_dir", type=Path); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.input_dir.is_dir(): fail(f"输入目录不存在：{args.input_dir}")
    if args.output.exists(): fail(f"报告已存在，拒绝覆盖：{args.output}")
    Image, _, _ = require_pillow()
    paths = sorted((p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS), key=lambda p: (p.name.casefold(), p.name))
    items, failures = [], []
    for i, path in enumerate(paths, 1):
        item = {"style_image_id": f"style-{i:02d}", "filename": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        try:
            with Image.open(path) as im: im.verify()
            with Image.open(path) as im: item.update(readable=True, format=im.format, width=im.width, height=im.height, mode=im.mode)
        except Exception as exc: item.update(readable=False, error=str(exc)); failures.append(f"style-{i:02d} 文件损坏或无法读取")
        items.append(item)
    if not 3 <= len(paths) <= 12: failures.append(f"风格参考图数量为 {len(paths)}，建议并要求 3–12 张")
    write_json(args.output, {"image_count": len(paths), "images": items, "critical_failures": failures, "human_review_required": ["确认素材权利和来源", "排除品牌、IP、人物肖像与在世艺术家模仿目标", "总结多图共有规律而非复制具体作品"]})
    print(f"已检查 {len(paths)} 张风格参考图；报告：{args.output}")
    return 1 if failures else 0


if __name__ == "__main__": raise SystemExit(main())
