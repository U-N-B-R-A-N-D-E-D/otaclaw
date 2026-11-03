# OtaClaw Monitoring

Lightweight, optional logging and metrics system for OtaClaw. Designed to give real visibility into the system without adding overhead in production.

## Philosophy

- **Optional by default** — zero allocations and zero work when disabled.
- **One file, one class** — `src/js/core/monitor.js` exports `OtaclawMonitor` and a singleton `otaclawMonitor`.
- **Compatible with existing code** — the legacy `WebSocketClient.log()` and the existing `config.logging` block keep working.
- **Layered**, opt-in per level.

## Levels

| Level | Purpose | Cost when on | Cost when off |
|-------|---------|--------------|---------------|
| 0 — `console` | Pretty-printed `console.log/warn/error` with `[OtaClaw …]` prefix | One `indexOf` per call | One `indexOf` per call |
| 1 — `metrics` | In-memory counters (`connection`, `emotions`, `performance`) | Small object writes | `null` check, returns |
| 2 — `export` | `toJSON()`, `dumpToConsole()`, `snapshot()` helpers for the debug panel | Only when called | — |
| 3 — `remote` | Batched `fetch` to an external endpoint | One `setInterval` + queue | Skipped entirely |

## Configuration

`config/config.js` (or `config.example.js`):

```javascript
monitoring: {
  console: true,          // Level 0
  metrics: false,         // Level 1
  remote: false,          // Level 3
  remoteEndpoint: null,
  batchInterval: 5000,
  logLevel: 'info',       // 'debug' | 'info' | 'warn' | 'error'
}
```

In `local` mode (`MODE_OVERRIDES.local`), `metrics: true` and `logLevel: 'debug'` are turned on automatically.

## Usage

```javascript
import { otaclawMonitor as monitor } from './core/monitor.js';

monitor.log('websocket.connected', { url });
monitor.warn('state_machine.inactivity_timeout', { wasState });
monitor.error('init.failed', { error: String(err) });
monitor.debug('tab.hidden');

// Direct metric updates (no-op when metrics disabled)
monitor.recordTransition('thinking', 'success', 'agent.complete');
monitor.recordReconnect();
monitor.recordMetric('performance', 'fps', 58);
```

## Inspecting Live Metrics

The singleton is exposed on `window.otaclawMonitor` for in-browser debugging:

```javascript
// In DevTools console:
otaclawMonitor.dumpToConsole();   // pretty tables
otaclawMonitor.snapshot();        // structured copy
otaclawMonitor.toJSON();          // serialized
```

## Event Naming Convention

Use dotted, namespaced event names. Examples already in use:

- `websocket.connecting`, `websocket.connected`, `websocket.disconnected`
- `websocket.reconnecting`, `websocket.max_reconnect_reached`
- `websocket.transport_error`, `websocket.offline_suggested`
- `state_machine.invalid_state`, `state_machine.inactivity_timeout`
- `animation.unknown_sequence`
- `activity.timeout.forcing_idle`
- `init.failed`, `config.load.failed`
- `offline.demo_mode`, `emotions_demo.failed`, `tab.hidden`, `tab.visible`

## Remote Export (Optional)

To stream events to an external collector:

```javascript
monitoring: {
  remote: true,
  remoteEndpoint: 'https://your-collector.example.com/ingest',
  batchInterval: 5000,
}
```

The monitor flushes its queue every `batchInterval` ms with `fetch(POST)`. Failures are swallowed (`.catch(() => {})`) so a flaky collector cannot break the UI.

## Re-configuring at Runtime

`app.js` calls `monitor.configure(this.config)` after `loadConfig()` so the singleton picks up the real values. You can call `monitor.configure(newConfig)` at any time — the remote timer is stopped and rebuilt if needed.

## What This Replaces

Previously the codebase had ad-hoc debug instrumentation (POSTs to `127.0.0.1:7700`) scattered through `easter-eggs.js`. That has been removed. The monitor is the single, controllable substitute and is **off** by default for everything beyond the console.

## Where It's Wired

- `src/js/app.js` — init failures, config load failures, visibility, activity timeout, demo mode, all WebSocket lifecycle events.
- `src/js/websocket-client.js` — connect / close / transport-error metrics, URL-param debug log.
- `src/js/core/state-machine.js` — every transition (`recordTransition`) and inactivity warnings.
- `src/js/core/animation-controller.js` — unknown sequence warnings.
