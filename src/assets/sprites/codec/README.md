# Codec portraits

Dedicated art for Codec mode (the `!codec` / four-corner / Konami easter egg).
These are **not** the live avatar frames and are never used by idle/work states.

- Native size: **52×89** (portrait, aspect 52:89). Rendered with an integer 2×
  scale and `image-rendering: pixelated`, so keep the native size when adding art.
- Source: Otacon sheet provided for this project. Same third-party fan-art terms
  as the rest of the sprites (see [ASSETS.md](../../../../ASSETS.md)).

## Sets

| Files | Frames | Use |
|---|---|---|
| `g1-1..5.png` | 5 | Default Codec sequence (neutral talking). |
| `g2-1..5.png` | 5 | Alternate talking set. |
| `g3-1..5.png` | 5 | Alternate talking set. |
| `g4-1..5.png` | 5 | Alternate talking set. |
| `shock-1..3.png` | 3 | Wide-eyed / alarmed. |
| `neutral.png` | 1 | Single calm portrait. |

## Config

In `config/config.js`:

```js
codecFace: [
  'codec/g1-1.png', 'codec/g1-2.png', 'codec/g1-3.png',
  'codec/g1-4.png', 'codec/g1-5.png',
],
codecFrameMs: 1200, // ms per frame; omit/1 frame for a static portrait
```

A single string works too: `codecFace: 'codec/neutral.png'`.
