#!/usr/bin/env python3
"""校验并非覆盖地保存人工视觉分析生成的风格档案。"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import fail, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="校验风格分析 JSON，并保存为可复用的 .json/.md 档案。")
    parser.add_argument("analysis_json", type=Path); parser.add_argument("profiles_dir", type=Path)
    args = parser.parse_args()
    try: data = json.loads(args.analysis_json.read_text(encoding="utf-8"))
    except Exception as exc: fail(f"无法读取分析 JSON：{exc}")
    required = ["profile_id", "display_name", "version", "source_image_ids", "rights_confirmed", "status", "summary", "positive_requirements", "negative_constraints", "visual_parameters", "evidence", "prohibited_references"]
    missing = [k for k in required if k not in data]
    if missing: fail("缺少字段：" + ", ".join(missing))
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(data["profile_id"])): fail("profile_id 只能使用小写字母、数字和连字符")
    if data["status"] not in {"draft", "approved"}: fail("status 只能是 draft 或 approved")
    if data["status"] == "approved" and not data["rights_confirmed"]: fail("approved 档案必须 rights_confirmed=true")
    if data["prohibited_references"]: fail("存在禁止的品牌/IP/艺术家模仿引用，不能保存为可用档案")
    if len(data["source_image_ids"]) < 3: fail("至少需要 3 张风格参考图")
    stem = f"{data['profile_id']}-v{data['version']}"; jp, mp = args.profiles_dir / f"{stem}.json", args.profiles_dir / f"{stem}.md"
    if jp.exists() or mp.exists(): fail(f"同版本档案已存在，拒绝覆盖：{stem}")
    write_json(jp, data)
    lines = [f"# {data['display_name']}（v{data['version']}）", "", data["summary"], "", f"状态：{data['status']}", "", "## 正向要求", ""] + [f"- {x}" for x in data["positive_requirements"]] + ["", "## 负向约束", ""] + [f"- {x}" for x in data["negative_constraints"]] + ["", "## 来源图片", ""] + [f"- {x}" for x in data["source_image_ids"]]
    mp.write_text("\n".join(lines)+"\n", encoding="utf-8")
    print(f"风格档案已保存：{jp}；{mp}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
