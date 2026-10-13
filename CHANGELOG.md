# Changelog

All notable changes to OtaClaw.

## [Unreleased]

### Changed

- Docs: full public README (thesis, architecture, verified quickstart, limitations), `AGENTS.md`, `CITATION.cff`.
- Docs/config: internal hostnames and machine names removed from examples (placeholders only).

## [0.0.7] - 2026-07-14

### Added

- **Gateway-agnostic config** – Prefer `gateway` in config; `openclaw` remains a backward-compatible alias. Works with OpenClaw, HAL Discord bot, or any WS bridge that emits `agent.*` / `gateway.*` events.
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
