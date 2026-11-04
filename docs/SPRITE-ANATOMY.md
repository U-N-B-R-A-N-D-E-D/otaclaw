# Sprite anatomy

What each of the 43 grid frames actually shows, measured pixel by pixel. Data:
`src/data/sprite-anatomy.json`. Viewer: `tools/sprite-anatomy.html` (families with
the changed pixels outlined, sequences before/after with real timing, codec).

## Method

Every pair of frames was compared after aligning their canvases (bottom-aligned,
best horizontal offset, transparent pixels zeroed). Pairs that differ by a few
pixels share one body drawing and form a **family**; the differing pixels are
the face change, and the face change is the meaning.

| Pixels changed | What it usually is |
|---|---|
| 3–9, at the mouth (rows ~25–27) | mouth shape: closed / ajar / open / corners down |
| 6–9, at the lenses (rows ~15–16) | pupils flatten (half-blink, narrowed) or shift (glance) |
| 2–3 between the lenses | brow furrow |
| ~26–34 on the cheeks | blush (two red rows) plus a smile |
| 50–300 | same pose, arm or hair redrawn (body variant) |

## Families

| Family | Base | Variants (what changes) |
|---|---|---|
| `rest_hip` | `0,0` rest | `7,3` blush + smile · `8,3` blush + smile + glance away |
| `rest_clasp` | `8,0` hands clasped | `6,3` blush + smile |
| `chin` | `4,0` hand to chin | `5,0` eyes narrowed (half-blink) · `6,0` glance · `7,0`, `11,0` body variants |
| `crossed` | `9,0` arms crossed | `10,0` eyes narrowed (half-blink) · `4,2` brow furrow + mouth down |
| `point` | `8,1` fist forward, mouth closed | `1,3` mouth ajar · `9,1` open · `10,1` open + narrowed eyes · `2,0` frown · `11,1` brow up · `1,0`, `7,1`, `6,2` arm variants (neutral, half-wink, wink) |
| `thumbs` | `0,1` thumbs up | `1,1` thumb raised (wind-up) · `2,1` grin + wink · `3,1` follow-through |
| `shrug` | `4,1` palms up | `5,1` bigger, brow up, glance away |
| `recoil` | `0,2` startled, teeth gritted | `1,2` eyes squeezed (wince) |
| `slump` | `2,2` dejected | `3,2` lip quiver |
| `collar` | `0,3` collar tug, nervous grin | `5,3` + blush · `9,3` face drained pale |
| `laugh` | `2,3` | `3,3` head dips · `4,3` head back up (a bounce) |
| singles | `3,0` arms folded · `5,2` attentive · `6,1` hands on hips · `7,2` wave · `10,3` skull fright | |

## What the old mapping got wrong

- `9,0`/`10,0` were "hand to face, surprised"; they are a calm arms-crossed pose
  and its half-blink. `surprised` now uses the real startle (`0,2`).
- `0,3`/`1,3` were "talking filler"; `0,3` is a nervous collar tug, `1,3` is the
  mid frame of a lip-sync cycle (`8,1 → 1,3 → 9,1`). That cycle is the new
  `speaking` state.
- `6,2` was "phone to ear"; it is a fist-forward wink. `4,3` "wink right" is a
  laugh frame; `5,3` "wink left" is embarrassment; `6,3`/`7,3` "ta-da" are blushes.
- `8,1`–`11,1` were "hand on hip, confident"; they are the talking family. The
  hands-on-hips frame is `6,1`.
- `5,1` was "worried"; it is a big shrug (confused).
- Several legacy file names lie about their art (`coat_*` are hand-to-chin poses,
  `thumbs_00..02` have no thumb, `blink_*` are full-body frames, `blush_04` is
  the pale face); `sprite-anatomy.json` lists them.

## Sequencing rules

1. Stay inside a family while a state loops: only the face changes, so the body
   never jumps. Cross families only on long holds.
2. Use per-frame timing: a sequence entry may be `[col, row, ms]`. Half-blinks and
   lip-sync shapes are short (80–250 ms); base poses hold (1–6 s).
3. Terminal states read as anticipation → action → settle
   (`success`: thumb raised → thumbs up → grin + wink → follow-through).
4. Native blinks exist for `4,0 → 5,0`, `9,0 → 10,0` and `9,1 → 10,1`; the eye
   overlay still covers only `0,0`.

## Codec

Each set is `[1 base, 2 half-blink, 3 blink, 4 mouth open, 5 mouth half]`: eyes and
mouth change separately. Listening states only blink (`1 → 2 → 3 → 2`), talking
states move the mouth (`1 → 4 → 5 → 4`). `g1` neutral, `g2` the same expression in
another render, `g3` brows lower (serious), `g4` slight smile, `neutral.png` glasses
glare, `shock-1..3` a separate close-up that escalates. Entries take an optional
`@ms` suffix (`codec/g1-2.png@80`).
