#!/usr/bin/env python3
"""检查宠物参考照片并生成稳定编号清单。"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import fail, require_pillow, write_json

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> int:
    parser = argparse.ArgumentParser(description="检查 5–8 张宠物照片的格式、尺寸与可读性，并输出 JSON 清单。")
    parser.add_argument("input_dir", type=Path, help="照片目录")
    parser.add_argument("--output", type=Path, required=True, help="JSON 报告路径（不得已存在）")
    parser.add_argument("--min-edge", type=int, default=512, help="建议最短边像素，默认 512")
    args = parser.parse_args()
    if not args.input_dir.is_dir():
        fail(f"输入目录不存在：{args.input_dir}")
    if args.output.exists():
        fail(f"报告已存在，拒绝覆盖：{args.output}")
    Image, _, _ = require_pillow()
    candidates = sorted((p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS), key=lambda p: (p.name.casefold(), p.name))
    results, critical, warnings = [], [], []
    for index, path in enumerate(candidates, 1):
        item = {"photo_id": f"photo-{index:02d}", "filename": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                item.update(format=image.format, width=image.width, height=image.height, mode=image.mode, readable=True)
                if min(image.width, image.height) < args.min_edge:
                    warnings.append(f"{item['photo_id']} 最短边小于 {args.min_edge}px")
        except Exception as exc:
            item.update(readable=False, error=str(exc))
            critical.append(f"{item['photo_id']} 文件损坏或无法读取")
        results.append(item)
    if not 5 <= len(candidates) <= 8:
        critical.append(f"照片数量为 {len(candidates)}，要求 5–8 张")
    write_json(args.output, {"input_directory": str(args.input_dir), "photo_count": len(candidates), "photos": results, "warnings": warnings, "critical_failures": critical, "visual_review_required": ["至少两张清晰正脸", "至少一张侧脸", "至少一张全身", "无严重遮挡/过暗/过度美颜", "单只宠物且主体明确"]})
    print(f"已检查 {len(candidates)} 张照片；报告：{args.output}")
    return 1 if critical else 0


if __name__ == "__main__":
    raise SystemExit(main())
