# AGENTS.md — otaclaw

> Guide for contributors and coding agents. Tool-agnostic.

## What this is

Animated pixel-art companion that gives any LLM or agent WebSocket event stream
a reactive face (kiosk, widget, floating HUD, Raspberry Pi).

## Layout

- `docs/ARCHITECTURE.md` — **read this first**: runtime flow, sources of truth,
  invariants, known debt.
- `src/` — static app (vanilla HTML/CSS/JS): `index.html` (kiosk),
  `widget.html` (embed/floating HUD), `js/`, `css/`, `data/` (sprite/frame
  catalogs), `assets/sprites/`.
- `src/js/core/` — state machine, avatar director, animation controller, speech
  policy, emotion patterns; unit tests in `src/js/core/__tests__/`.
- `src/js/websocket-client.js` — gateway connection (heartbeat, reconnect, queue).
- `config/config.example.js` — template; copy to `config/config.js` (git-ignored).
- `src/js/core/state-sprite-map.js` — state → sprite table, signals,
  priority/debounce coordinator (`docs/STATE-SPRITES.md`).
- `docs/` — protocol (`WEBSOCKET-PROTOCOL.md`), API, customization, hardware.
- `deploy/`, `scripts/`, `start-kiosk.sh` — optional kiosk / Pi / desktop helpers.
- `tools/mac-float/main.swift` — optional native macOS floating panel.
- `examples/gateway.mjs` — reference BYOA gateway with no inference.

## Build, test, run

- Install: `npm install`
- Test: `npm test` (must pass before any PR; 111 tests, 6 suites)
- Lint: `npm run lint` (0 errors expected; a few warnings exist)
- Build: `npm run build` is a no-op (no build step)
- Demo: `npm run gateway:demo`
- Regenerate sprite tables: `npm run docs:sprite-map`
- Static dev server: `npx serve . -p 8080`, then
  `http://localhost:8080/?demo=1`

## Rules

- One blink engine (`app.js`), one render path (individual PNGs + integer scale;
  sheet-crop only as fallback), one config precedence (`config/config.js` >
  example). Do not add a second engine "in parallel".
- `sprite-runtime.js` is a side-effect module imported first by `app.js`; it
  installs the sprite globals and the boot sequence. Keep that import first;
  do not load it separately from the HTML.
- Bubble text goes through `src/js/core/speech-policy.js`; do not summarize in
  event handlers.
- Document every new event in `docs/WEBSOCKET-PROTOCOL.md` and the default
  `eventMap`.
- No inference in this repo. The agent owns the model; OtaClaw owns the face.

## Conventions

- Branching: `main` is stable; work on `feat/*`, `fix/*`, `docs/*`, `chore/*`;
  open a PR.
- Style: ESLint (`eslint.config.js`); no frameworks, keep it vanilla JS.
  Conventional-style commit messages (`feat:`, `fix:`, `docs:`).
- Do not commit secrets, local paths, hostnames or IP addresses; use
  placeholders (`example.local`, `<HOST>`, `YOUR_HOST`).
- Keep the protocol gateway-agnostic: OpenClaw is one integration, not a
  requirement.
- Sprite art is third-party (see `NOTICE`); do not add other copyrighted assets.
- Do not edit `config/config.js` into the repo; it is ignored on purpose.
- All committed text (docs, comments, examples) is in English.

## Pointers

- Docs: `docs/` · Changelog: `CHANGELOG.md` · Contributing: `CONTRIBUTING.md`
