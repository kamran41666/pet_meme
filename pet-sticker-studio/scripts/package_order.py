#!/usr/bin/env python3
"""非破坏地复制订单生产资料到标准交付目录。"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import fail, write_json


def copy_item(source: Path, destination: Path) -> list[Path]:
    if not source.exists(): fail(f"缺少打包来源：{source}")
    copied = []
    if source.is_dir():
        destination.mkdir(parents=True, exist_ok=False)
        for p in source.rglob("*"):
            rel = p.relative_to(source); target = destination / rel
            if p.is_dir(): target.mkdir(parents=True, exist_ok=True)
            else: target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, target); copied.append(target)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(source, destination); copied.append(destination)
    return copied


def main() -> int:
    parser = argparse.ArgumentParser(description="创建含输入、身份卡、锚点、试作、无字图、成品、预览和 QA 的订单包。")
    parser.add_argument("--order-json", type=Path, required=True); parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--identity", type=Path, required=True); parser.add_argument("--anchor", type=Path, required=True)
    parser.add_argument("--pilots", type=Path, required=True); parser.add_argument("--no-caption", type=Path, required=True)
    parser.add_argument("--final", type=Path, required=True); parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--qa", type=Path, required=True); parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): fail(f"订单包已存在，拒绝覆盖或删除：{args.output}")
    try: order = json.loads(args.order_json.read_text(encoding="utf-8"))
    except Exception as exc: fail(f"无法读取 order.json：{exc}")
    if not order.get("photo_rights_confirmation"): fail("photo_rights_confirmation 必须为 true")
    args.output.mkdir(parents=True)
    copied = []
    mapping = [(args.order_json, Path("order.json")), (args.inputs, Path("inputs")), (args.identity, Path("identity")), (args.anchor, Path("anchor")), (args.pilots, Path("pilots")), (args.no_caption, Path("no-caption")), (args.final, Path("final")), (args.preview, Path("preview") / args.preview.name), (args.qa, Path("qa"))]
    try:
        for source, rel in mapping: copied += copy_item(source, args.output / rel)
        usage = "本订单包含 10 张透明底 PNG。仅供订单约定用途；案例展示需单独授权。客观质量问题请按订单规则反馈。\n"
        (args.output / "使用说明.txt").write_text(usage, encoding="utf-8"); copied.append(args.output / "使用说明.txt")
        manifest = {"order_id": order.get("order_id"), "pet_name": order.get("pet_name"), "case_display_authorization": bool(order.get("case_display_authorization", False)), "recommended_photo_deletion_date": (date.today()+timedelta(days=30)).isoformat(), "files": []}
        for p in sorted(copied): manifest["files"].append({"path": p.relative_to(args.output).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size})
        write_json(args.output / "manifest.json", manifest)
    except Exception:
        # 保留已创建的部分包以便诊断；不执行破坏性回滚删除。
        raise
    print(f"订单包已创建：{args.output}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
