#!/usr/bin/env python3
"""
Import captions from qwen2-vl-captioner-relaxed-batch (or any .txt-per-image) into sprite-catalog.json.

The captioner outputs image.png + image.txt (same base name). This script:
- Reads each .txt
- Maps filename → sprite in catalog by file
- Updates desc (first phrase) and tags (rest parsed as comma-separated)

Usage:
  python scripts/import-captions-to-catalog.py --input /path/to/captioner/output
  # or if captions are next to images in assets/sprites:
  python scripts/import-captions-to-catalog.py --input src/assets/sprites
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = REPO_ROOT / "src" / "data" / "sprite-catalog.json"


def parse_caption(text: str) -> tuple[str, list[str]]:
    """Extract short desc (first phrase) and tags from caption."""
    text = text.strip()
    if not text:
        return "", []
    # Try: "Short phrase. tag1, tag2, tag3" or "tag1, tag2, tag3"
    parts = re.split(r"[.!?]\s+", text, 1)
    if len(parts) >= 2:
        desc = parts[0].strip()
        rest = parts[1]
    else:
        desc = ""
        rest = text
    tags = [t.strip().lower() for t in re.split(r"[,;]", rest) if t.strip()]
    if desc and not tags:
        tags = [w.lower() for w in desc.replace(".", "").split() if len(w) > 2][:8]
    elif not desc and tags:
        desc = tags[0] if tags else ""
    return desc, tags


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", "-i", required=True, type=Path, help="Folder with .png and .txt files")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    inp = args.input.resolve()
    if not inp.exists():
        print(f"Not found: {inp}")
        return 1

    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)

    sprites = catalog.get("sprites", [])
    # Map: filename stem -> sprite (e.g. otacon_sprite.png_0000_Sprite-1 -> sprite)
    by_stem = {Path(s["file"]).stem: s for s in sprites}

    updated = 0
    for txt_path in sorted(inp.glob("*.txt")):
        base = txt_path.stem  # e.g. otacon_sprite.png_0000_Sprite-1
        sprite = by_stem.get(base)
        if not sprite:
            continue
        cap = txt_path.read_text(encoding="utf-8", errors="replace")
        desc, tags = parse_caption(cap)
        if desc or tags:
            sprite["desc"] = desc or sprite.get("desc", "")
            sprite["tags"] = tags if tags else sprite.get("tags", [])
            updated += 1
            print(f"[{sprite.get('idx')}] {sprite['file']} → {desc[:40]}...")

    if not args.dry_run and updated:
        with open(CATALOG_PATH, "w", encoding="utf-8") as f:
            json.dump(catalog, f, indent=2, ensure_ascii=False)
        print(f"\nUpdated {updated} sprites in {CATALOG_PATH}")
    else:
        print(f"\nDry run: would update {updated}")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
