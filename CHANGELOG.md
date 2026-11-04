# Changelog

All notable changes to OtaClaw.

## [0.0.9] - 2026-11-04

### Changed

- **Visual pass over every sprite** (`docs/SPRITE-ANATOMY.md`, `src/data/sprite-anatomy.json`): frames were compared pixel by pixel after aligning their canvases and grouped into 16 families that share one body drawing; variants differ by a few face pixels (half-blink, glance, mouth shape, brow, blush). Descriptions, primaries and tags in `frame-catalog.json`, `sprite-catalog.json` and `sprite-functions.json` now say what the pixels show (for example `9,0`/`10,0` are arms crossed and its half-blink, not "surprised"; `6,2` is a wink, not a phone; `4,3` is a laugh frame, not a wink).
- Sprite function ids describe their art (`startled`, `talk_open`, `collar_tug`, ...); every pre-v3 id still resolves to the same cell via `aliases`. `hands_on_hips` now names the frame that shows it (`6,1`).
- State sequences stay inside one family while they loop, and terminal states read anticipation -> action -> settle. All 43 cells are used.
- Codec portraits: listening states only blink, talking states move the mouth; `g2..g4` are assigned by their real expression.

### Added

- `npm run demo:kiosk`: one command starts the reference gateway and opens only the kiosk (native float on macOS, windowless kiosk on Linux/Windows). No browser tab or landing page.
- Per-frame timing: a sequence entry may be `[col, row, ms]` (state table, catalog sequences and the director); codec entries take `file@ms`.
- `speaking` state: lip-sync on the fist-forward family (`8,1 -> 1,3 -> 9,1`).
- `tools/sprite-anatomy.html`: families with the changed pixels outlined, sequences before/after with real timing, codec preview.
- `tools/sprite-labels-seed.json`: suggested labels from the visual pass.

## [0.0.8] - 2026-11-02

### Added

- **Click-to-copy bubbles**: click or tap the speech bubble (or the codec
  subtitle) to copy the current line to the clipboard.
- **Notification-aware faces**: explicit alert/warning/critical notification
  text selects `surprised` (Woah) / `worried` / `curious` before the generic success face.
- **Coherent state -> sprite mapping** (`src/js/core/state-sprite-map.js`, `docs/STATE-SPRITES.md`): every state plays one fixed, deterministic sequence of existing catalog frames; gateway events go through a priority + minimum-hold coordinator, so rapid event bursts no longer flicker, and transient states return to the active work state (or idle) on their own.
- New states `tool` (one stable pose for every tool call) and `attention` (waiting for the user).
- `agent.signal` event: any gateway can send a name or an emoji (`{"type":"agent.signal","signal":"🤔"}`) resolved by `stateSprites.signalMap`.
- `stateSprites` config block (`enabled`, `toolCategoryReactions`, `states`, `signalMap`). `enabled: false` restores the previous behaviour.
- 34 unit tests for the mapping, event/signal resolution, priority/debounce, auto-return and deterministic playback.
- **Speech policy** (`src/js/core/speech-policy.js`, `docs/SPEECH.md`): one local
  summarizer for every bubble path (lead sentence, skips greetings, strips
  markdown/code/URLs, 84-char compact / 120-char kiosk budget, clause-boundary
  cuts). The compact bubble is clamped to 5 lines and can no longer grow above
  the window.
- **Avatar director** (`src/js/core/avatar-director.js`, `docs/SPRITE-FUNCTIONS.md`):
  Vibeconferencing-style priority waterfall over the 1:1 sprite manifest;
  `agent.sprite` picks an exact frame, cell or tool sequence.
- **Compact 9:16 HUD**: fixed 180×320 window, auto sprite fit (~2.5×), hover-only
  settings gear, sprite-size preference (60–160%), drag anywhere, persisted
  position.
- **Eye-only blink**: extracted a transparent eye overlay from the blink art, so
  the compact HUD blinks again without swapping the whole body; one quick
  close (no 2-4 rapid frames).
- **Codec view redesign**: pure black screen, frequency panel on top, the full
  portrait (no crop) and the speech text as subtitles below; CRT power-on/off
  animation (`codec-crt-on` / `codec-crt-off`) used only when entering/leaving
  codec mode. All 24 codec portraits are mapped to states (g1 calm, g2
  attentive, g3 serious, g4 positive, shock, neutral).
- **Full sprite utilization**: every one of the 43 catalog frames is reachable
  by a default state; idle now loops four calm poses including `11,0`, and
  processing uses `7,1`. `npm run sprites:usage` reports 43/43 (100%).
- **`sprite-runtime.js`** is now an ES module imported first by `app.js`
  (previously the classic `app-calibration.js`); the HTML no longer loads it
  separately.
- **Sprite map generator**: `npm run docs:sprite-map` rebuilds the frame, tool,
  event and unused-cell tables from the catalogs.

### Fixed

- `AnimationController.setFrame()` no longer clears the speech bubble when called without speech (the bubble was wiped on every frame of work states).
- The client's blind `timeout -> idle` emission no longer interrupts a running task when the coordinator is active.

### Changed

- Docs: full public README (thesis, architecture, verified quickstart, limitations), `AGENTS.md`, `CITATION.cff`.
- Docs/config: internal hostnames and machine names removed from examples (placeholders only).
- Docs are English-only; obsolete benchmarks, legacy mapping notes and personal
  deployment notes were removed. `package-lock.json` is committed; the original
  sprite sheet is tracked for the fallback path.

### Removed

- `DEPLOY.md`, `tools/needle-bench/`, `docs/CLAWEDBOT-CONFIG.md`,
  `docs/SPRITE-MAPPING.md`, `docs/PI-PERFORMANCE-ANALYSIS.md` and the ignored
  WIP notes. Tests: 111 in 6 suites.

## [0.0.7] - 2026-07-14

### Added

- **Gateway-agnostic config** – Prefer `gateway` in config; `openclaw` remains a backward-compatible alias. Works with OpenClaw or any WS bridge that emits `agent.*` / `gateway.*` events.
- **Emotion patterns + character expression** – Shared pattern table and expression engine for richer reactions.
- **Monitoring** – Optional `OtaclawMonitor` (metrics / remote export). See `docs/MONITORING.md`.
- **StockAgent events** – `stockagent.trade.opened|closed`, `stockagent.analyzing`.
- **Tool categories & progress phases** in default `eventMap` (search/creative/risky/analytical + planning/executing/validating/finalizing).
- **WebSocket protocol docs** – `docs/WEBSOCKET-PROTOCOL.md`.

### Changed

- OpenClaw is an optional peer dependency (not required).
- Sprite catalog / frame catalog expanded; organic idle + tag sequences populated.
- Animation controller / calibration / kiosk script stability fixes.

### Fixed

- Tickle / laughing / sleep-wake edge cases and catalog-driven frame selection.
- Speech bubble and thinking-token filtering carried forward from 0.0.6.

**Compatibility:** Any gateway speaking protocol v3 event shapes. OpenClaw ≥ 2026.2.x still supported.

## [0.0.6] - 2026-04-02

### Fixed

- **Speech bubble thinking tokens** – Filter LLM reasoning artifacts from display. Removes `<think>...</think>` blocks, repetitive dots (`........`), reasoning markers, and incomplete thinking tags that were showing raw in the speech bubble during streaming.
- **Speech bubble text overflow** – Improved CSS with word-wrap, max-width (320px), and proper text centering. Long messages now wrap instead of overflowing the bubble.
- **Text truncation** – Show last 80 chars of response (recent context) instead of first 100 chars when text is long.

### Changed

- Speech bubble font size reduced slightly (20px → 18px in widget) for better readability with longer text
- Added `_cleanThinkingTokens()` utility for filtering LLM artifacts

**Compatibility:** Tested with OpenClaw 2026.4.1 (protocol v3).

## [0.0.1] - 2026-03-01

### Added

- **Release 0.0.1** – First public release of OtaClaw for OpenClaw
- Wake/sleep sync between kiosk and tab via `client.interaction` broadcast
- Cursor visibility: hidden in kiosk, visible in tab
- Speech bubble positioning: lower in tab, visible on kiosk
- Sleep sequence: full black (sprite hidden), wake: light first then Hal rises

### Changed

- Speech bubble uses `top: 12%` in tab (non-kiosk) for better visibility
- Kiosk detection via `?kiosk=1` or `display.kioskMode` for cursor/behavior

### Fixed

- **Tickle (laughing) state** – Hal no longer disappears on tickle. Prefer catalog laughing (Layer-2/3/4); fallback to `laughingSprites`; final fallback uses hardcoded Layer files (never sprite sheet, which 404s).
- **Individual sprites only** – Widget and all states now use individual PNGs from sprite catalog. No sprite sheet (`otaclock-original.png` not shipped). `setFrame` and `_setFrameDirect` use sprite catalog when `useIndividualFiles` is true.

## [1.1.0] - 2026-02-28

### Added

- **WebSocket robustness**: Exponential backoff for reconnection, optional message batching for `agent.message.delta`
- **Debug panel**: Connection metrics (lastEvent, reconnectAttempts, queuedMessages, staleSince), manual Reconnect button
- **Offline behavior**: Auto-switch to demo mode after N failed reconnects (`offlineAfterReconnects`), `?demo=1` URL param
- **Emotional states**: `curious`, `confused`, `excited`, `presenting`; eventMap fallback `*` for unknown events
- **State chaining**: Configurable transitions (e.g. success → presenting → idle)
- **Event priority**: `eventPriority` config so higher-priority events override; `agent.tool.call` briefly interrupts thinking
- **OpenClaw events**: `session.start`, `session.end`, `channel.connected`, `channel.disconnected`
- **Behavior profiles**: `minimal`, `expressive` presets for eventMap and stateDurations
- **Performance**: Delta throttling (100ms), sprite preload, queue size debug logging
- **Multi-platform**: `display.kioskMode`, `?kiosk=1` URL param, 44px touch targets, responsive layout
- **Security**: Token redaction in debug output, URL param preferred over config, [docs/SECURITY.md](docs/SECURITY.md)
- **Distribution**: CHANGELOG, improved README, OpenClaw compatibility docs

### Changed

- Auth token: URL param now preferred over config (runtime over default)
- CSS state transitions for smoother state changes

## [1.0.0] - 2026

Initial release. WebSocket integration, emotional states, kiosk mode, deploy script.

---

**Compatibility:** OtaClaw requires OpenClaw 2026.2.x or later (protocol v3). Tested with OpenClaw 2026.4.1.
