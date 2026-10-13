# AGENTS.md — otaclaw

> Guide for contributors and coding agents. Tool-agnostic.

## What this is
Animated pixel-art companion that gives any LLM or agent WebSocket event stream a reactive face (kiosk, widget, Raspberry Pi).

## Layout
- `src/` — static app (vanilla HTML/CSS/JS): `index.html` (kiosk), `widget.html` (embed), `js/`, `css/`, `data/` (sprite/frame catalogs), `assets/sprites/`.
- `src/js/core/` — state machine, animation controller, emotion patterns; unit tests in `src/js/core/__tests__/`.
- `src/js/websocket-client.js` — gateway connection (heartbeat, reconnect, queue).
- `config/config.example.js` — template; copy to `config/config.js` (git-ignored).
- `src/js/core/state-sprite-map.js` — state -> sprite table, signals, priority/debounce coordinator (`docs/STATE-SPRITES.md`).
- `docs/` — protocol (`WEBSOCKET-PROTOCOL.md`), API, customization, hardware, integration.
- `deploy/`, `scripts/`, `start-kiosk.sh` — optional Raspberry Pi / kiosk helpers (bash).
- `tools/needle-bench/` — experimental benchmarks, not used at runtime.

## Build, test, run
- Install: `npm install`
- Test: `npm test` (must pass before any PR; 90 tests)
- Lint: `npm run lint` (0 errors expected; warnings exist)
- Build: `npm run build` is a no-op (no build step)
- Run: `npx serve src -p 8080`, then open `http://localhost:8080/?demo=1`

## Conventions
- Branching: `main` is stable; work on `feat/*`, `fix/*`, `docs/*`, `chore/*`; open a PR.
- Style: ESLint (`eslint.config.js`); no frameworks, keep it vanilla JS. Conventional-style commit messages (`feat:`, `fix:`, `docs:`).
- Do not commit secrets, local paths, hostnames or IP addresses; use placeholders (`example.local`, `<HOST>`, `YOUR_HOST`).
- Keep the protocol gateway-agnostic: document new events in `docs/WEBSOCKET-PROTOCOL.md` and the default `eventMap`.
- Sprite art is third-party (see `NOTICE`); do not add other copyrighted assets.
- Do not edit `config/config.js` into the repo; it is ignored on purpose.

## Pointers
- Docs: `docs/` · Changelog: `CHANGELOG.md` · Contributing: `CONTRIBUTING.md`
