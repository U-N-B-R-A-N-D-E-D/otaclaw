# Sprite Mapping Reference

## Canonical: otaclock-original.png (source: sethen/otaclock, Konami OtaClock)
**Source**: https://github.com/sethen/otaclock - `src/sass/components/Otacon.scss`  
**Sheet**: sprites.png → otaclock-original.png (1126×1291 px)  
**CSS**: `background-size: auto 900px`

| State     | Class          | background-position | Width | Height |
|-----------|----------------|---------------------|-------|--------|
| idle      | .stationary    | -489px 0            | 205   | 447    |
| thinking  | .stationary    | -489px 0            | 205   | 447    |
| processing| .thumbs-up-2   | -214px -391px       | 238   | 448    |
| success   | .thumbs-up-3   | -452px -452px       | 238   | 448    |
| error     | .stationary    | -489px 0            | 205   | 447    |
| laughing  | thumbs-up-1   | 0 -392px            | 204   | 448    |
| surprised | thumbs-up-3   | -452px -452px       | 238   | 448    |

**Note**: sethen sheet only has stationary + 3 thumbs-up. Laugh/surprised reuse thumbs-up poses.

### Original sethen/otaclock animations (Konami OtaClock)
The original OtaClock app **does** have sprite animations:
- **Eyes**: Separate sprite layer with 5 positions (ahead, close, down_right, down_left, forward), randomized every 5s
- **Thumbs-up**: When "working", cycles position 1→2→3 every 500ms
- Eyes are defined in Otacon.scss as `.eyes` with distinct `background-position` per state

OtaClaw's default sheet (otaclock-original.png) is a flattened export—no separate eye layer. We could add subtle whole-frame CSS animations (e.g. idle breathe, processing pulse) to `.otacon-frame`.

### Speech bubble
The sethen sheet includes a speech bubble in the image. We overlay our own HTML/CSS bubble with dynamic text per state:
- `idle`: (empty)
- `thinking`: "Thinking..."
- `processing`: "Processing..."
- `success`: "Success!"
- `error`: "Error"
- `laughing`: "Haha!"
- `surprised`: "?!"

---

## OtaClaw default sheet (otaclock-original.png) — ALL STATES
- **Size**: 567×278 px, 12 cols × 4 rows
- **Design ref**: each cell 2.43 cm × 1.73 cm (W×H)
- **Cell (computed)**: ~47×69 px (floor of 567/12, 278/4). Empty/partial: (9,2) (10,2) (11,2) (11,3).
- **Bleed fix**: if frames show pixels from neighbors, set `OTACON_GRID.cellW` and `OTACON_GRID.cellH` in app-calibration.js to match your export.
- **States**: Defined via mapping. **Calibration**: D → pick state → C → arrows / [ ] → S. Shift+S to clear. Persists in localStorage.

---

## Mapping format: how to describe each emotion

**Studio textarea format:**
```
emotion: col,row [col,row ...] [@scale]
```

- **emotion**: internal name (idle, thinking, processing, success, error, laughing, surprised, etc.)
- **col,row**: cell coordinate (col 0–11, row 0–3). Multiple cells = demo cycles through them.
- **@scale**: optional. If the frame overflows (arms wide, etc.): use `@0.9` to scale down.

**Examples:**
```
idle: 0,0 1,0
thinking: 2,0 3,0 4,0 5,0
processing: 3,1 4,1 @0.9
success: 0,1 1,1 2,1 3,1
error: 2,2 3,2 4,2
laughing: 2,3 3,3 4,3
surprised: 9,0 10,0
```

---

## Sprite optimization (low consumption)

For Pi/TFT35A with minimal CPU/bandwidth:

- **Format**: Prefer WebP over PNG (~30–50% smaller). `cwebp -q 85 otaclock-original.png -o otaclock-original.webp`
- **Resolution**: 567×278 is fine for 480×320 display. Avoid larger exports.
- **Palette**: PNG with `pngquant --quality 65-80` reduces size if WebP not used.
- **Single sheet**: Use one sprite sheet; avoid loading many small PNGs.

## Cell table (OtaClaw sheet 12×4)

| row | col 0 | col 1 | col 2 | col 3 | col 4 | col 5 | col 6 | col 7 | col 8 | col 9 | col 10 | col 11 |
|-----|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|--------|--------|
| **0** | neutral, arms relaxed | head left, arm across | head right, arm across | hand near chest | hand near chest | confused/thoughtful | left arm out | right arm out | arms crossed | **surprised L** | **surprised R** | contemplative |
| **1** | thumbs-up left | thumbs-up right | both thumbs-up | thumbs+hip success | **arms-open shrug (confused)** | **doubt shrug (confused)** — NOT idle | arm raised R | arm raised L | hand on hip R | hand on hip L | both hands hips | arm out, hip |
| **2** | lean forward, worried | lean back, puzzled | sad, clasped | sad intense | worried, chin | curious, smile | phone to ear | waving | pointing | *(partial)* | *(empty)* | *(empty)* |
| **3** | facing left | facing right | laughing | laughing wide | wink R | wink L | ta-da | ta-da left | arms crossed smug | shiver/cold | scared+object | *(empty)* |

**Overflow:** 4,1 (arms wide) requires `@0.9`. Avoid 9,2 10,2 11,2 11,3 (partial/empty cells).

---

## Frame catalog — Semantic range for Clawdbot

The sprite sheet provides a **range** of expressions, not just 7 fixed emotions. Clawdbot can pick frames by context (e.g. scary/alarming topic → scared pose 9,0 or 10,0).

**Tag hygiene:** `"unpleasant"` is scoped to the worried/sad/error/scared/cold cluster only (frames like 0,2 / 2,2 / 3,2 / 4,2 / 9,3 / 10,3) — it is intentionally NOT on the `surprised` frames (9,0 / 10,0), since a surprise is not inherently unpleasant. Sharing a catch-all tag across unrelated emotional categories previously let `surprised` frames leak into `worried`/`error` pool selection. Avoid re-adding a shared qualifier tag across categories that shouldn't blend (e.g. don't add `"unpleasant"` back to `surprised`, `laughing`, or `excited` frames).

**Catalog:** `src/data/frame-catalog.json` — each cell has:
- `primary` — exactly one emotion (hard gate for selection)
- `lane` — `idle` | `work` | `react` | `social` (`social` never auto during work)
- `tags` — soft rank / idle_micro only
- `desc` — human description

Selection matches `primary` + `lane`, not OR across many soft tags.

**Full emotional range demo:** Add `?emotions=1` to the URL. Two phases: (1) All sheet frames from frame-catalog (55 frames, 1.5s each), (2) Sequence demo – idle (blink/coat), thinking, processing, success (thumbs-up), error (shrug), laughing, surprised (blush). Loops. Press **F** to stop. Example: `widget.html?emotions=1`.

**Direct API:**
- `otaclaw.setFrame(col, row)` — display cell (col, row)
- `otaclaw.getFrameCatalog()` — returns the catalog (Promise)

**WebSocket (OpenClaw):** emit `otaclaw.frame` event:
```json
{ "type": "otaclaw.frame", "col": 9, "row": 0 }
```

**Clawdbot:** Include the catalog in the system prompt or as a tool. Given conversation context, pick the frame whose `tags` best match (e.g. "scared", "alarmed" → 9,0 or 10,0).

**Individual sprites:** Export each cell as a separate PNG for precise tagging. Use `sprite-catalog.json` with `useIndividualFiles: true`. Each sprite has `file`, `desc`, `tags`, and optional `skip`. Enables real animation ranges (e.g. 1-pixel micro-variants between frames).

**Vision tagging (Linux + GPU):** Use Qwen2-VL Captioner — same tool as LoRA training:
```bash
# 1. Clone captioner (Linux, ~20GB VRAM)
git clone https://github.com/MNeMoNiCuZ/qwen2-vl-7b-captioner-relaxed-batch
cd qwen2-vl-7b-captioner-relaxed-batch

# 2. Copy sprites to input/, edit batch.py DEFAULT_PROMPT:
#    "Caption this pixel art sprite. One short phrase + comma-separated tags for when an AI would show this (emotion, situation)."

# 3. Run
python batch.py

# 4. Merge .txt captions into sprite-catalog (from otaclaw repo root)
# (planned — not yet included in the repo)
# python scripts/import-captions-to-catalog.py --input /path/to/captioner/output
```

**Alternative (API):** A vision-based tagging script using OpenAI/OpenRouter is planned but not yet included.

**Caution — clean captioner output before merging:** raw captioner output is a sentence fragment, not a tag ("character at rest. frame 8 of 12: winding down. pixel art sprite."). Never paste that directly into a sprite's `tags` array — it breaks tag-based pool matching (identical boilerplate ends up shared across visually distinct sprites) and is unreadable as a tag. Always reduce each caption to 3–6 short, lowercase, single-or-two-word tags derived from its actual meaning (e.g. "emotion: alert, attentive, focused" → `["alert", "attentive", "focused"]`), matching the style of the curated entries in `frame-catalog.json` and the good entries already in `sprite-catalog.json`.

---

## otacon-sprites.png (Spriters Resource)
- **Size**: 563×339 px — alternative source, not currently used

---

## Konami OtaClock (2006) – extracted from Windows .exe
**Location**: `src/assets/sprites/otaclock-konami/`  
**Source**: OtaClock.exe (Windows), extracted with pefile. Credit: Konami / Kojima Productions.

| File | Size | Content |
|------|------|---------|
| bitmap_101.png | 40×160 | Font/number sprites (digits 0–9, labels RT/SP) |
| bitmap_102.png | 200×64 | **Otacon sprite sheet** – 6 poses (thinking ×3, thumbs-up ×2). Red chroma. |
| bitmap_103.png | 56×40 | Speech bubble graphic (white, red border) |
| sprite_3,5,6,11,12.png | 16–32×32–64 | Partial Otacon sprites (scaled variants) |

**Sounds**: `src/assets/sounds/sound_107.wav`, `sound_111.wav` – alarm/notification audio

---

## xythobuz/OtaClock (macOS port – Konami OtaClock)
**Location**: `src/assets/sprites/otaclock-xythobuz/`  
**Source**: https://github.com/xythobuz/OtaClock (archived 2023)

| File | Content |
|------|---------|
| otacon.png | **Base idle** – no eyes (blank glasses), for eyes overlay |
| otacon_1.png, otacon_2.png, otacon_3.png | Thumbs-up poses |
| eyes_0.png | Blink (eyes closed) |
| eyes_1–4.png | Eyes: bottom-left, top-left, bottom-right, top-right |
| bubble.png, font_*, dots_*, alarm.png, blank.png | UI assets |

**Eyes overlay**: From xythobuz Render.m – eyes at (3, 13) px within 29×64 otacon, size 15×6. EYE_X_OFFSET 60, EYE_Y_OFFSET 45 in 86×80 canvas. Follow mouse (quadrants) + random blink. Smooth opacity transition when switching.

---

## Additional sprite sources (not yet in project)
- **Spriters Resource**: MGS2 Otacon [24224](https://www.spriters-resource.com/playstation_2/mgs2/sheet/24224/), Photo Viewer [189420](https://www.spriters-resource.com/playstation_2/mgs2/sheet/189420/)
- **SRB2 Kart Otacon mod**: MGS2 Photo Viewer sprites, interpolated
- **MGS2 PS2 Textures**: [github.com/dotlessone/MGS2-PS2-Textures](https://github.com/dotlessone/MGS2-PS2-Textures) – textures, not sprites
