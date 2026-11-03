# Architecture — one-page map

Read this before changing runtime code. If the code and this page disagree, fix
both in the same PR.

## What it is

A static, vanilla HTML/CSS/JS face for **any** WebSocket agent gateway. No build
step, no framework. OpenClaw is one integration, not a requirement: anything
that emits the events in [WEBSOCKET-PROTOCOL.md](WEBSOCKET-PROTOCOL.md) can drive it.

## Runtime shapes

| Entry point | Mode | Notes |
|---|---|---|
| `src/index.html` | kiosk | Fullscreen; loads `js/app.js` (which imports `js/sprite-runtime.js` first). |
| `src/widget.html` | widget / embed | Resizable/iframe; also loaded by the macOS floating panel. |

Both load the same runtime: `js/websocket-client.js`, `js/otaclaw.js`,
`js/core/*`, `js/app.js`.

**Target (agreed):** one runtime + two thin shells. `index.html` only sets kiosk
mode, `widget.html` only sets widget mode (and stays the iframe URL). No config
or logic duplicated inside the HTML files.

## Data flow

```
gateway WebSocket
      │  connect / heartbeat / reconnect / queue
      ▼
js/websocket-client.js
      │  eventMap: agent.* / gateway.* -> state
      │  agent.signal -> signalMap -> state
      ▼
js/core/state-sprite-map.js  (priority + min hold + auto-return)
      ▼
js/core/animation-controller.js  (one sequence per state)
      ▼
renderer: #sprite .otacon-frame + speech bubble
```

Touch input lives in `js/otaclaw.js`; it emits `tickle` / `tap`, and `js/app.js`
forwards `client.interaction {action:"tickle"}` to the gateway. The face never
decides what the agent should say — that is the gateway's job.

## Sources of truth

| Concern | File |
|---|---|
| State list, sequences, signals | `src/js/core/state-sprite-map.js`, `docs/STATE-SPRITES.md` |
| Frame tags/coordinates | `src/data/frame-catalog.json` |
| What each frame shows (families, face deltas, blinks) | `src/data/sprite-anatomy.json`, `docs/SPRITE-ANATOMY.md` |
| Individual frame files + sequences | `src/data/sprite-catalog.json` |
| 1:1 sprite functions (id/emoji/cell/state) | `src/data/sprite-functions.json`, `docs/SPRITE-FUNCTIONS.md` |
| Event contract | `docs/WEBSOCKET-PROTOCOL.md` |
| BYOA inbound contract | `docs/BRING-YOUR-OWN-AGENT.md`, `POST /internal/notify` |
| Chat vs bubble policy | `docs/SPEECH.md` |
| Runtime base defaults | `src/js/default-config.js` (loaded by `widget.html`) |
| User config | `config/config.example.js` -> copy to `config/config.js` (git-ignored) |

## Where to change X

- **A state's poses/timing** → `state-sprite-map.js` + `docs/STATE-SPRITES.md`.
- **Event → state** → `eventMap` in config + `docs/WEBSOCKET-PROTOCOL.md`.
- **Emoji/name signals** → `signalMap` in `state-sprite-map.js`.
- **Sprite art** → `src/data/*.json` + `src/assets/sprites/` (see `docs/CUSTOMIZATION.md`). For a specific asset, use `agent.sprite` and the 1:1 manifest.
- **Bubble text** → `js/core/speech-policy.js`, `js/app.js` (`_shortSpeech` / `_updateSpeechBubble`) and `docs/SPEECH.md`; keep it derivable from real events.
- **Tickle / touch** → `js/otaclaw.js` (`setupTouchInteractions`).
- **Codec easter egg** → `js/easter-eggs.js`; its face is `sprites.codecFace` (dedicated 52×89 art in `assets/sprites/codec/`, string or frame array). `sprites.codecStateFaces` maps states such as `error`/`surprised` to the `shock-*` portraits.

## Invariants

1. **One blink engine.** `app.js` (`startBlinkOverlay` / `_doBlink`). Do not add a
   second scheduler.
2. **One render path.** Individual PNGs from `sprite-catalog.json`, integer scale
   (`floor(available / 64)`), `image-rendering: pixelated`. Sheet-crop is only a
   fallback for custom art without individual files.
3. **One config precedence.** `config/config.js` > `config.example.js` defaults.
   No inline per-page config blocks.
4. **Events are documented** in `docs/WEBSOCKET-PROTOCOL.md` and in the default
   `eventMap` before they are consumed.
5. **Bubbles are one short line**: `bubble`/`summary` → lead sentence of
   `content` → canned state label (84 chars compact / 120 kiosk, no
   markdown/code/URLs, never the user's message, never a mid-word cut). The
   full reply stays in the chat. See `docs/SPEECH.md`. A completion line stays
   on screen for its `holdMs`, even through success→idle.
6. **`sprite-runtime.js` is a side-effect module imported first by `app.js`.**
   It installs the sprite globals and the boot sequence; keep the import first
   and do not load it separately from the HTML.
7. **Public repo hygiene.** No hostnames, IPs, local paths, tokens or internal
   project names (see `AGENTS.md`).

## Known debt (remove, don't extend)

- Dead core blink engine: `animation-controller.js` `_startBlinkSystem`.
- Two idle engines: `startIdleAnimation` vs `startWaitingAnimation`.
- Three render paths: `_setFrameDirect` / `_setFrameFromSprite` / `_setSheetOverlayFrame`.
- `src/js/default-config.js` is still a separate base layer from `config.example.js`;
  fold the two when the calibration boot stops reading `window.OTACLAW_CONFIG`.
- Automated tests cover `core/` only (state, director, speech policy); `app.js` and `sprite-runtime.js` do not.

## Visual QA invariants

Before merging a rendering/input PR, verify in a browser (headless Chrome works):

1. Idle geometry is constant (no size/position jumps between frames or blinks).
2. A blink does not change the frame box.
3. Tickle only fires on the sprite (double tap or swipe on `#sprite .otacon-frame`).
4. Codec mode shows the dedicated codec portrait plus frequency bars and subtitles; it does not clone the live sprite.
5. Sequences play deterministically (`?demo=1` is a good smoke test).

## Bring your own agent

The gateway is replaceable. Emit the events in `docs/WEBSOCKET-PROTOCOL.md`
(`agent.*`, `gateway.*`, `agent.signal`); the tickle contract is
`client.interaction {action:"tickle"}`.

Cost: this repo has **no inference**. The agent pays for its own conversation;
the face, the reference gateway and a read-only watcher add zero tokens. The
local tickle reaction is the default; any server-side agent turn is opt-in.

A runnable reference gateway lives in `examples/gateway.mjs`
(`npm run gateway:demo`); the public inbound contract is
`POST /internal/notify {event, payload}`. See
[docs/BRING-YOUR-OWN-AGENT.md](BRING-YOUR-OWN-AGENT.md).
