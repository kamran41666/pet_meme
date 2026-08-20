#!/usr/bin/env python3
"""在无字透明 PNG 上添加固定中文文案。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import EXPRESSIONS, fail, require_pillow


def find_font(explicit: Path | None) -> Path:
    candidates = [explicit] if explicit else []
    windir = Path(os.environ.get("WINDIR", "C:/Windows"))
    candidates += [windir / "Fonts/msyh.ttc", windir / "Fonts/msyhbd.ttc", windir / "Fonts/simhei.ttf", Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"), Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")]
    for path in candidates:
        if path and path.is_file():
            return path
    fail("找不到可用中文字体。请用 --font 指定支持中文的 .ttf/.ttc 文件。")


def main() -> int:
    parser = argparse.ArgumentParser(description="为固定十张或单张试作无字 PNG 添加中文文案，不覆盖输入。")
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--font", type=Path, help="中文字体 .ttf/.ttc 路径")
    parser.add_argument("--position", choices=["top", "bottom"], default="bottom")
    parser.add_argument("--font-ratio", type=float, default=0.115, help="字号相对画布宽度，默认 0.115")
    parser.add_argument("--stroke-ratio", type=float, default=0.009, help="描边相对画布宽度，默认 0.009")
    parser.add_argument("--only", choices=[key for _, key, _ in EXPRESSIONS], help="只处理指定表情键，用于单张试作")
    args = parser.parse_args()
    if not args.input_dir.is_dir(): fail(f"输入目录不存在：{args.input_dir}")
    if args.output_dir.exists() and any(args.output_dir.iterdir()): fail(f"输出目录非空，拒绝覆盖：{args.output_dir}")
    font_path = find_font(args.font)
    Image, ImageDraw, ImageFont = require_pillow()
    inputs = []
    selected = [item for item in EXPRESSIONS if not args.only or item[1] == args.only]
    for seq, key, caption in selected:
        path = args.input_dir / f"{seq}-{key}.png"
        if not path.is_file(): fail(f"缺少无字图：{path.name}")
        inputs.append((path, caption))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for path, caption in inputs:
        with Image.open(path) as source:
            image = source.convert("RGBA")
        size = max(16, round(image.width * args.font_ratio))
        font = ImageFont.truetype(str(font_path), size=size)
        draw = ImageDraw.Draw(image)
        stroke = max(1, round(image.width * args.stroke_ratio))
        box = draw.textbbox((0, 0), caption, font=font, stroke_width=stroke)
        tw, th = box[2] - box[0], box[3] - box[1]
        x = (image.width - tw) // 2
        margin = round(image.height * 0.055)
        y = margin - box[1] if args.position == "top" else image.height - margin - th - box[1]
        draw.text((x, y), caption, font=font, fill=(255, 255, 255, 255), stroke_width=stroke, stroke_fill=(75, 48, 38, 255))
        image.save(args.output_dir / path.name, format="PNG")
    print(f"已使用字体 {font_path} 生成 {len(inputs)} 张带字图：{args.output_dir}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
