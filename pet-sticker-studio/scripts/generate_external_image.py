#!/usr/bin/env python3
"""Generate one image through an Alibaba Model Studio workspace endpoint.

Secrets are loaded from a local .env or the project's two-column .env.csv and
are never written to reports or standard output.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def load_config(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise ValueError(f"Config file does not exist: {path}")
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.reader(handle))
        if len(rows) < 2 or len(rows[0]) < 2:
            raise ValueError("CSV config must have two columns and at least one data row")
        return {row[0].strip(): row[1].strip() for row in rows[1:] if len(row) >= 2 and row[0].strip()}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def config_value(config: dict[str, str], *names: str) -> str | None:
    normalized = {key.lower().replace("_", ""): value for key, value in config.items()}
    for name in names:
        value = normalized.get(name.lower().replace("_", ""))
        if value:
            return value
    return None


def find_image_url(response: dict[str, Any]) -> str | None:
    for choice in response.get("output", {}).get("choices", []):
        for item in choice.get("message", {}).get("content", []):
            for key in ("image", "url", "image_url"):
                if item.get(key):
                    return str(item[key])
    results = response.get("output", {}).get("results", [])
    if results and results[0].get("url"):
        return str(results[0]["url"])
    data = response.get("data", [])
    if data and data[0].get("url"):
        return str(data[0]["url"])
    return None


def image_data_url(path: Path) -> str:
    if not path.is_file():
        raise ValueError(f"Reference image does not exist: {path}")
    mime_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".gif": "image/gif",
    }
    mime_type = mime_types.get(path.suffix.lower())
    if not mime_type:
        raise ValueError(f"Unsupported reference image format: {path.suffix}")
    data = path.read_bytes()
    if len(data) > 20 * 1024 * 1024:
        raise ValueError(f"Reference image exceeds 20 MB: {path}")
    return f"data:{mime_type};base64,{base64.b64encode(data).decode('ascii')}"


def request_json(request: urllib.request.Request, timeout: int) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        message = f"HTTP {exc.code}"
        try:
            error = json.loads(exc.read().decode("utf-8"))
            safe_detail = error.get("message") or error.get("code")
            if safe_detail:
                message += f": {safe_detail}"
        except (ValueError, UnicodeDecodeError):
            pass
        raise RuntimeError(message) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate one image with an external DashScope workspace API")
    parser.add_argument("--config", type=Path, required=True, help="Path to .env or two-column .env.csv")
    parser.add_argument("--prompt-file", type=Path, required=True, help="UTF-8 text prompt")
    parser.add_argument(
        "--reference-image",
        type=Path,
        action="append",
        default=[],
        help="Reference image in prompt order; repeat 1-3 times for Qwen Image 3.0 I2I",
    )
    parser.add_argument("--negative-prompt-file", type=Path, help="Optional UTF-8 negative prompt")
    parser.add_argument("--output", type=Path, required=True, help="New image path; existing files are never overwritten")
    parser.add_argument("--model", default="qwen-image-3.0")
    parser.add_argument("--size", default="1024*1024", choices=("512*512", "768*768", "1024*1024", "1536*1536", "2048*2048"))
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--prompt-extend", action="store_true", help="Allow the provider to rewrite/expand the prompt")
    parser.add_argument("--watermark", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.output.exists():
        print(f"Refusing to overwrite existing output: {args.output}", file=sys.stderr)
        return 2
    if not args.prompt_file.is_file():
        print(f"Prompt file does not exist: {args.prompt_file}", file=sys.stderr)
        return 2
    if len(args.reference_image) > 3 and args.model.startswith("qwen-image-3.0"):
        print("Qwen Image 3.0 accepts at most three reference images", file=sys.stderr)
        return 2

    try:
        config = load_config(args.config)
        api_key = config_value(config, "apiKey", "DASHSCOPE_API_KEY")
        base_url = config_value(config, "dashScope", "DASHSCOPE_BASE_URL")
        if not api_key or not base_url:
            raise ValueError("Config must contain apiKey/DASHSCOPE_API_KEY and dashScope/DASHSCOPE_BASE_URL")
        endpoint = base_url.rstrip("/") + "/services/aigc/multimodal-generation/generation"
        prompt = args.prompt_file.read_text(encoding="utf-8-sig").strip()
        if not prompt:
            raise ValueError("Prompt file is empty")

        content = [{"image": image_data_url(path)} for path in args.reference_image]
        content.append({"text": prompt})
        negative_prompt = None
        if args.negative_prompt_file:
            if not args.negative_prompt_file.is_file():
                raise ValueError(f"Negative prompt file does not exist: {args.negative_prompt_file}")
            negative_prompt = args.negative_prompt_file.read_text(encoding="utf-8-sig").strip()

        payload = {
            "model": args.model,
            "input": {"messages": [{"role": "user", "content": content}]},
            "parameters": {
                "size": args.size,
                "n": 1,
                "prompt_extend": args.prompt_extend,
                "watermark": args.watermark,
            },
        }
        if negative_prompt:
            payload["parameters"]["negative_prompt"] = negative_prompt
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        response = request_json(request, args.timeout)
        image_url = find_image_url(response)
        if not image_url:
            raise RuntimeError("The API response did not contain an image URL")

        args.output.parent.mkdir(parents=True, exist_ok=True)
        download = urllib.request.Request(image_url, headers={"User-Agent": "pet-sticker-studio/1.0"})
        try:
            with urllib.request.urlopen(download, timeout=args.timeout) as source, args.output.open("xb") as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
        except Exception:
            args.output.unlink(missing_ok=True)
            raise

        safe_result = {
            "success": True,
            "model": args.model,
            "size": args.size,
            "reference_image_count": len(args.reference_image),
            "output": str(args.output.resolve()),
            "request_id": response.get("request_id"),
        }
        print(json.dumps(safe_result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"External generation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
