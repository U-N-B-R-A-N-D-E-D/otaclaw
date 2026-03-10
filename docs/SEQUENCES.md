# Animation Sequences Reference

Sequences used by the OtaClaw widget. Edit `src/widget.html` or `config/config.js` to change.

## Sprite groups (idleSpriteGroups)

| Group   | Indices | Purpose                    |
|---------|---------|----------------------------|
| neutral | 0, 1, 2 | Neutral poses, arms crossed |
| coat    | 3, 4, 5, 6 | Coat adjust, slower     |
| blink   | 7, 8, 9 | Blink + hair, quick (~50ms/frame) |

## Per-frame timing and keyframe hold

- **frameTiming**: Per-state `frameMs` (number or number[]) for smoother animations. E.g. `success: { frameMs: [200,200,200,800,200,200,200] }` holds the thumbs-up payoff longer.
- **holdFrames**: When sequence reaches this index, hold for ms. E.g. `success: { index: 3, ms: 800 }`.
- **idlePhaseTiming**: Per-group timing for idle (neutral, coat, blink). Overrides idleBaseDelayMs/idleJitterMs when set.

## Tag-to-sequence (agent-driven)

- **tagToSequences**: When agent sends `otaclaw.frame` with tag, play a [col,row] sequence instead of single random frame. E.g. `laughing: [[2,3],[3,3],[2,3],[3,3]]`.
- **tagSequenceFrameMs**: Delay between frames in tag sequences (default 350).

## Optional sequence config

- **successSequence**: When set, overrides successSprites + frameTiming. `{ sprites: [...], frameMs: [200,200,800,...], loop: false }`.

## Sheet fallback (frame-catalog)

When sprite arrays are empty, the widget loads `data/frame-catalog.json` and uses its `sequences` (thinking, processing, success, laughing, error, surprised) for sheet-mode animations.

## Current sequences (from widget.html)

### Idle
- **idleSequence**: indices into idleSprites; blink (7,8,9) filtered when blinkOverlay
- **idlePhaseTiming**: neutral/coat/blink baseMs + jitterMs
- **idleCoatIndices**: [3,4,5,6], **idleCoatMultiplier**: 3

### Thinking / Processing
- **thinkingSequence**: `[0, 1, 0, 1, 2, 1, 0]`
- **thinkingSprites**: 3 frames
- **frameTiming.thinking**: 300ms, **frameTiming.processing**: 250ms

### Success
- **successSprites**: 7 frames (thumbs)
- **frameTiming.success**: [200,200,200,800,200,200,200], **holdFrames.success**: index 3, 800ms

### Error
- **errorSprites**: 2 frames
- **frameTiming.error**: [400, 600]

### Laughing / Surprised
- **frameTiming.laughing**: 350ms, **frameTiming.surprised**: 350ms

---

**If your thinking sequence is different**, update `thinkingSequence` in config with the indices you want, e.g. `[0, 1, 2, 1, 0]`.
