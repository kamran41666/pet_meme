#!/usr/bin/env python3
"""验证十张最终 PNG 并生成双格式 QA 报告。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import EXPRESSIONS, fail, require_pillow, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="检查固定十张 PNG 的数量、命名、尺寸、可读性和透明通道。")
    parser.add_argument("final_dir", type=Path)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1024, help="预期正方形边长，默认 1024")
    args = parser.parse_args()
    if not args.final_dir.is_dir(): fail(f"成品目录不存在：{args.final_dir}")
    json_path, md_path = args.report_dir / "qa_report.json", args.report_dir / "qa_report.md"
    if json_path.exists() or md_path.exists(): fail(f"报告已存在，拒绝覆盖：{args.report_dir}")
    Image, _, _ = require_pillow()
    expected = {f"{s}-{k}.png" for s, k, _ in EXPRESSIONS}
    found = {p.name for p in args.final_dir.iterdir() if p.is_file() and p.suffix.lower() == ".png"}
    failures, files = [], []
    if len(found) != 10: failures.append(f"PNG 数量为 {len(found)}，要求恰好 10 张")
    if found != expected:
        if expected - found: failures.append("缺失文件：" + ", ".join(sorted(expected - found)))
        if found - expected: failures.append("多余或命名错误：" + ", ".join(sorted(found - expected)))
    dimensions = set()
    for name in sorted(found):
        path, item = args.final_dir / name, {"filename": name}
        try:
            with Image.open(path) as im:
                im.load(); dimensions.add(im.size)
                extrema = im.getchannel("A").getextrema() if "A" in im.getbands() else None
                item.update(readable=True, size=list(im.size), mode=im.mode, alpha_extrema=list(extrema) if extrema else None)
                if im.size != (args.size, args.size): failures.append(f"{name} 尺寸为 {im.size}，要求 {args.size}×{args.size}")
                if extrema is None: failures.append(f"{name} 缺少 alpha 通道")
                elif extrema[0] == 255: failures.append(f"{name} alpha 全不透明，背景未透明")
        except Exception as exc:
            item.update(readable=False, error=str(exc)); failures.append(f"{name} 文件损坏或不可读")
        files.append(item)
    if len(dimensions) > 1: failures.append("成品尺寸不一致")
    report = {"passed": not failures, "automatic_scope": "文件规则；仍需人工检查身份、结构、文字内容、风格、隐私授权与 IP 风险", "failures": failures, "files": files}
    write_json(json_path, report)
    args.report_dir.mkdir(parents=True, exist_ok=True)
    lines = ["# QA 文件检查报告", "", f"结果：{'通过' if not failures else '失败'}", "", "## 自动检查", "", f"- PNG 数量：{len(found)}", f"- 预期尺寸：{args.size}×{args.size}", "- 人工复核仍必需：身份、结构、错字/遮脸、风格、隐私授权与 IP 风险", "", "## 失败项", ""]
    lines += [f"- {x}" for x in failures] or ["- 无"]
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"QA {'通过' if not failures else '失败'}；报告：{args.report_dir}")
    return 0 if not failures else 1


if __name__ == "__main__": raise SystemExit(main())
