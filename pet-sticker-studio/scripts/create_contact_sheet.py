#!/usr/bin/env python3
"""创建 5×2 宠物表情预览联系表。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import EXPRESSIONS, fail, require_pillow


def font_path(explicit: Path | None) -> Path:
    candidates = [explicit] if explicit else []
    root = Path(os.environ.get("WINDIR", "C:/Windows"))
    candidates += [root / "Fonts/msyh.ttc", root / "Fonts/simhei.ttf", Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")]
    for p in candidates:
        if p and p.is_file(): return p
    fail("找不到中文字体；请用 --font 指定。")


def main() -> int:
    parser = argparse.ArgumentParser(description="从十张最终 PNG 生成 5 列×2 行联系表，不修改成品。")
    parser.add_argument("final_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--pet-name", required=True)
    parser.add_argument("--font", type=Path)
    parser.add_argument("--watermark", default="预览", help="水印文字；传空字符串可禁用")
    parser.add_argument("--cell-size", type=int, default=320)
    args = parser.parse_args()
    if args.output.exists(): fail(f"输出已存在，拒绝覆盖：{args.output}")
    Image, ImageDraw, ImageFont = require_pillow(); fp = font_path(args.font)
    label_h, columns, rows = 54, 5, 2
    sheet = Image.new("RGBA", (columns * args.cell_size, rows * (args.cell_size + label_h) + 60), (250, 246, 240, 255))
    draw = ImageDraw.Draw(sheet); label_font = ImageFont.truetype(str(fp), max(18, args.cell_size // 14)); wm_font = ImageFont.truetype(str(fp), max(32, args.cell_size // 6))
    for i, (seq, key, caption) in enumerate(EXPRESSIONS):
        path = args.final_dir / f"{seq}-{key}.png"
        if not path.is_file(): fail(f"缺少成品：{path.name}")
        with Image.open(path) as im: tile = im.convert("RGBA"); tile.thumbnail((args.cell_size - 24, args.cell_size - 24), Image.Resampling.LANCZOS)
        col, row = i % columns, i // columns; ox, oy = col * args.cell_size, 60 + row * (args.cell_size + label_h)
        sheet.alpha_composite(tile, (ox + (args.cell_size - tile.width)//2, oy + (args.cell_size - tile.height)//2))
        text = f"{seq} {caption}"; box = draw.textbbox((0,0), text, font=label_font); draw.text((ox + (args.cell_size-(box[2]-box[0]))//2, oy+args.cell_size+8), text, font=label_font, fill=(72,51,43,255))
    title = f"{args.pet_name} · 专属表情包"; draw.text((24, 14), title, font=label_font, fill=(72,51,43,255))
    if args.watermark:
        overlay = Image.new("RGBA", sheet.size, (0,0,0,0)); od = ImageDraw.Draw(overlay)
        for y in range(130, sheet.height, 240):
            for x in range(80, sheet.width, 360): od.text((x,y), args.watermark, font=wm_font, fill=(90,70,60,58))
        sheet = Image.alpha_composite(sheet, overlay)
    args.output.parent.mkdir(parents=True, exist_ok=True); sheet.convert("RGB").save(args.output, quality=92)
    print(f"联系表已生成：{args.output}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
