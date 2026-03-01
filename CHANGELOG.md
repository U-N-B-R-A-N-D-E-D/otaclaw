# Changelog

All notable changes to OtaClaw for OpenClaw.

## [0.0.1-beta] - 2026-03-01

### Added

- **Beta release** – First public baseline for OtaClaw for OpenClaw
- Wake/sleep sync between kiosk and tab via `client.interaction` broadcast
- Cursor visibility: hidden in kiosk, visible in tab
- Speech bubble positioning: lower in tab, visible on kiosk
- Sleep sequence: full black (sprite hidden), wake: light first then Hal rises

### Changed

- Speech bubble uses `top: 12%` in tab (non-kiosk) for better visibility
- Kiosk detection via `?kiosk=1` or `display.kioskMode` for cursor/behavior

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

**Compatibility:** OtaClaw requires OpenClaw 2026.2.x or later (protocol v3).
