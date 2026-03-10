# OpenClaw Core Integration

OtaClaw is a visual face for [OpenClaw](https://github.com/openclaw/openclaw) — an animated companion that accompanies your interactions with the gateway. This guide explains how to integrate OtaClaw so the agent emits visual reactions alongside written output.

## Overview

OtaClaw listens to OpenClaw WebSocket events and displays an animated avatar. For **semantic frame selection** (matching emotions to the conversation), emit `otaclaw.frame` with `col` and `row` from the frame catalog.

**Design goals:**
- **Lightweight** – No extra model calls; pick from a small catalog by tag match
- **Fast** – O(1) lookup; no heavy computation
- **Narrative** – Visual reaction accompanies written reply

## Event Protocol

### Automatic State Mapping

OtaClaw maps standard OpenClaw events to states:

| Event | OtaClaw State | Bubble |
|-------|----------------|--------|
| `agent.message.start` | thinking | Hmmm.... |
| `agent.message.delta` | processing | Processing |
| `agent.message.complete` | success | Got it! |
| `agent.message.error` | error | Oops... |
| `agent.tool.call` | surprised | Woah! |
| `gateway.idle` | idle | (empty) |
| `session.start` | thinking | - |
| `session.end` | idle | - |
| `channel.connected` | idle | - |
| `channel.disconnected` | idle | - |

Unknown events map to `idle` (fallback). No agent changes needed for automatic mapping.

### Semantic Frame Selection: `otaclaw.frame`

For context-aware expressions, emit a frame event. Supports **direct coordinates** or **tag lookup**:

**By tag (recommended):**
```json
{"type":"otaclaw.frame","tag":"worried","speech":"Hmm..."}
```

**By coordinates:**
```json
{"type":"otaclaw.frame","col":9,"row":0,"speech":"Yikes!"}
```

- `tag` – Resolved via `config.sprites.tagToFrames`; picks random frame from the list.
- `col`, `row` – Direct grid cell.
- `speech` – Optional bubble text (~25 chars).

See [OTACLAW-AGENT.md](OTACLAW-AGENT.md) for the full tag list and agent prompt template.

## Frame Catalog

Located at `data/frame-catalog.json` and `data/sprite-catalog.json` (individual sprites).

Each frame has:
- `col`, `row` – grid position
- `tags` – e.g. `["surprised", "shocked", "unpleasant"]`
- `desc` – human description

**Clawdbot integration:** Include the catalog (or a compact tag→(col,row) map) in the system prompt or as a tool. Given conversation context, pick the frame whose tags best match the emotional tone.

### Tag-to-Frame Config (`sprites.tagToFrames`)

Configure in `config.js` or `widget.html`:

```javascript
sprites: {
  tagToFrames: {
    unpleasant: [[9,0], [10,0]],
    success: [[0,1], [1,1], [2,1], [6,3], [7,3]],
    thinking: [[1,0], [2,0], [5,0], [11,0]],
    sad: [[2,2], [3,2]],
    laughing: [[2,3], [3,3]],
    worried: [[0,2], [4,2]],
    waving: [[7,2]],
    scared: [[10,3]],
    confident: [[8,1], [9,1], [10,1], [8,3]],
    wink: [[4,3], [5,3]],
    // ... see config.example.js for full list
  },
}
```

Override to customize. Random choice within each list adds variety.

### i18n / Speech Strings

All UI and speech bubble text is configurable via `config.i18n`:

```javascript
i18n: {
  thinking: 'Hmmm....',
  processing: 'Processing',
  success: 'Got it!',
  error: 'Oops...',
  laughing: 'Haha!',
  surprised: 'Woah!',
  connecting: 'Connecting...',
  checkConfig: 'Check config',
  // ... see config.example.js for full list
}
```

Override for localization or branding.

## Implementing in OpenClaw

### Option A: System Prompt

Add to the agent system prompt (see [OTACLAW-AGENT.md](OTACLAW-AGENT.md) for full template):

```
When your response has emotional tone, emit:
{"type":"otaclaw.frame","tag":"TAG","speech":"..."}
Tags: idle, thinking, success, error, laughing, surprised, worried, puzzled, sad, waving, scared, confident, wink, curious, presenting, cold, unpleasant
```

The gateway must forward `otaclaw.frame` events to WebSocket clients.

### Option B: otaclaw_react Tool

Define a tool the agent can call:

```json
{
  "name": "otaclaw_react",
  "description": "Set OtaClaw avatar emotion. Tags: idle, thinking, success, error, laughing, surprised, worried, puzzled, sad, waving, scared, confident, wink, curious, presenting, cold, unpleasant",
  "parameters": {
    "emotion": { "type": "string" },
    "speech": { "type": "string", "description": "Optional bubble text (~25 chars)" }
  }
}
```

Tool implementation maps `emotion` → tag → `(col, row)` via `tagToFrames` and emits `otaclaw.frame`.

### Option C: Post-Processing

After each assistant message, run a lightweight classifier or rule engine on the text. Map detected tone → frame → emit `otaclaw.frame`. No model call; regex or keyword match is enough.

## Performance

- **Catalog size:** ~48 frames; JSON < 10 KB
- **Memory:** For long-running kiosks, `maxQueuedMessages` caps offline queue size. Delta events are batched (`deltaBatchMs`) to reduce DOM updates. Enable `sprites.preload` to avoid first-frame delay.
- **Lookup:** O(1) by (col,row); O(n) by tag if scanning (n small)
- **Emit:** Single WebSocket message; no blocking

## Widget Embedding

Use OtaClaw as a floating widget in other UIs:

**iframe:**
```html
<iframe
  src="http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html"
  width="200" height="300"
  style="border:none; border-radius:12px;"
></iframe>
```

**Standalone popup:**
```javascript
window.open(
  'http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html',
  'otaclaw',
  'width=220,height=320,resizable=yes'
);
```

## Debug Panel and Connection Status

When `behavior.debug` is enabled, long-press or press `D` to open the debug panel. It shows:

- **WebSocket:** Connection status (connected, disconnected, connecting)
- **Current State:** OtaClaw state (idle, thinking, etc.)
- **Last Event:** Most recent state trigger
- **Uptime:** Seconds since connection

When `openclaw.debugPanel` is true (default), additional connection metrics are shown:

- **Last Event Type:** Raw OpenClaw event (e.g. `agent.message.delta`)
- **Reconnect Attempts:** Number of reconnection attempts since last connect
- **Queued Messages:** Messages queued while offline
- **Stale Since:** Time of last received message if connection is stale

The **Reconnect** button forces an immediate reconnection attempt.

## Distribution

OtaClaw is open source (MIT). You can:

- **Fork and customize** – Change sprites, states, event mapping, i18n
- **Share** – Deploy to your OpenClaw instance; others can use the same deploy script
- **Embed** – Use the widget in iframes, dashboards, or custom UIs

Minimum OpenClaw version: 2026.2.x (protocol v3). See [SECURITY.md](SECURITY.md) for token handling and deployment practices.

## Deployment

1. Deploy OtaClaw to OpenClaw Canvas: `./deploy/deploy-to-openclaw.sh --local`
2. Access full UI: `http://localhost:18789/__openclaw__/canvas/otaclaw/`
3. Access widget: `http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html`
4. Configure `js/config.js` with your OpenClaw host if not localhost
