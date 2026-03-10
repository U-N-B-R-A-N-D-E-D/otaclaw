#!/usr/bin/env python3
"""
Tag sprites using a vision model. Generates desc + tags for Clawdbot semantic selection.

Usage:
  python scripts/tag-sprites-vision.py [--dry-run] [--only idx,idx,...]

Env:
  VISION_API_URL   OpenAI-compatible endpoint (default: https://api.openai.com/v1)
  VISION_API_KEY  API key (required for OpenAI)
  VISION_MODEL    Model name (default: gpt-4o for vision)

Local vision (Qwen-VL, LLaVA, etc. on OpenAI-compatible server):
  VISION_API_URL=http://localhost:8080/v1 VISION_MODEL=qwen-vl python scripts/tag-sprites-vision.py

OpenAI (needs key):
  VISION_API_KEY=sk-... python scripts/tag-sprites-vision.py

OpenRouter Qwen-VL (free tier):
  VISION_API_URL=https://openrouter.ai/api/v1 VISION_API_KEY=... VISION_MODEL=qwen/qwen-vl-plus python scripts/tag-sprites-vision.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "src"
CATALOG_PATH = SRC / "data" / "sprite-catalog.json"
SPRITES_DIR = SRC / "assets" / "sprites"

PROMPT = """Describe this pixel art sprite in one short phrase (under 10 words).
Then list 5-10 tags for semantic matching: when would an AI assistant show this pose?
Include: emotion, situation, context. Examples: neutral, idle, thinking, surprised, scared, happy, success, error, unpleasant, explaining, confident.
Reply ONLY with valid JSON: {"desc": "...", "tags": ["tag1", "tag2", ...]}"""


def load_catalog() -> dict:
    with open(CATALOG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_catalog(data: dict) -> None:
    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def image_to_base64(path: Path) -> str:
    with open(path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("ascii")


def call_vision(image_b64: str, url: str, key: str, model: str) -> dict:
    import urllib.request

    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 200,
    }
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(
        f"{url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        out = json.load(resp)
    text = out["choices"][0]["message"]["content"]
    # Extract JSON from response (handle markdown code blocks)
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser(description="Tag sprites with vision model")
    parser.add_argument("--dry-run", action="store_true", help="Do not write catalog")
    parser.add_argument("--only", type=str, help="Comma-separated indices to process (e.g. 0,1,2)")
    args = parser.parse_args()

    url = os.environ.get("VISION_API_URL", "https://api.openai.com/v1")
    key = os.environ.get("VISION_API_KEY", "")
    model = os.environ.get("VISION_MODEL", "gpt-4o")

    if "openai.com" in url and not key:
        print("VISION_API_KEY required for OpenAI. Use local URL or OpenRouter for keyless.", file=sys.stderr)
        return 1

    catalog = load_catalog()
    sprites = catalog.get("sprites", [])
    if not sprites:
        print("No sprites in catalog.", file=sys.stderr)
        return 1

    only = None
    if args.only:
        only = {int(x.strip()) for x in args.only.split(",")}

    for s in sprites:
        if s.get("skip"):
            continue
        if only is not None and s.get("idx") not in only:
            continue
        path = SPRITES_DIR / s["file"]
        if not path.exists():
            print(f"Skip {s['file']} (not found)")
            continue
        print(f"[{s['idx']}] {s['file']} ...", end=" ", flush=True)
        try:
            b64 = image_to_base64(path)
            result = call_vision(b64, url, key, model)
            s["desc"] = result.get("desc", s.get("desc", ""))
            s["tags"] = result.get("tags", s.get("tags", []))
            print(f"desc={s['desc'][:40]}... tags={s['tags'][:3]}...")
        except Exception as e:
            print(f"ERROR: {e}")
            continue

    if not args.dry_run:
        save_catalog(catalog)
        print(f"\nSaved to {CATALOG_PATH}")
    else:
        print("\nDry run - no changes written")

    return 0


if __name__ == "__main__":
    sys.exit(main())
