# WebSocket Protocol v3 – Event Gateway ↔ OtaClaw

Protocol version: **v3**. Any event gateway that speaks these shapes works (OpenClaw ≥ 2026.2.x, HAL Discord Bot on port 18789, or a custom bridge in front of any LLM).

## Connection Parameters

**Endpoints:**
- WebSocket: `ws://<host>:18789/ws`
- HTTP static server: `http://<host>:18789/` (serves `/src/` files from OtaClaw repo)
- Status endpoint: `http://<host>:18789/ws-status` (GET JSON)
- Health endpoint: `http://<host>:18789/health` (GET, returns `ok`)

**Default host:** `localhost` (pi-claw uses URL param `?hal_ws=ws://192.168.86.29:18789/ws`)

## Handshake

Client must send a `connect` request immediately after connection:

```json
{
  "type": "req",
  "id": "otaclaw-connect-...",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "webchat",
      "displayName": "OtaClaw Widget",
      "version": "1.0.0",
      "platform": "browser",
      "mode": "webchat"
    },
    "scopes": ["operator.read", "operator.write"]
  }
}
```

Server responds:

```json
{
  "type": "res",
  "id": "otaclaw-connect-...",
  "ok": true
}
```

## Message Flow

### Ping/Pong Keep‑Alive

**WS-level (transport)**
- Server sends `ws.ping()` every 30s.
- Client must reply with `ws.pong()`.
- Any client that fails to pong within **60s** is considered stale and forcibly terminated.
- Server logs evictions and increments `totalStaleEvictions` counter.

**Application-level (semantic)**
- Server broadcasts `gateway.heartbeat` event every 30s:

  ```json
  {
    "type": "event",
    "event": "gateway.heartbeat",
    "payload": { "ts": 1747392000000 }
  }
  ```

- Client can send `client.ping` or `client.refresh` (both answered with `server.pong`).

### Client‑Side Heartbeat (OtaClaw)

`WebSocketClient` includes robust heartbeat logic (`startHeartbeat()`, `stopHeartbeat()`):

- Sends `client.refresh` every `heartbeatInterval` (default 45s).
- Detects stale connection if no message received for `staleThreshold` (default 120s).
- Forces reconnection via `reconnectIfStale()`.

## Event Forwarding

HAL Discord Bot broadcasts events to all connected clients via `otaclawEmit(type, payload)`.

**Event format (server→client):**
```json
{
  "type": "agent.message.delta",
  "event": "agent",
  "stream": "assistant",
  "phase": null,
  "content": "...",
  "...": "..."
}
```

**Key event mappings:**
- `agent.message.*` → `"stream": "assistant"`
- `agent.tool.call` → `"stream": "tool"`
- `agent.message.error` → `"stream": "error"`
- `gateway.idle` → `"event": "gateway.idle"`
- Easter eggs (`easter.*`) → `"event": "easter.trigger"`

## Reconnection Strategy

**Client (`WebSocketClient.js`):**
1. **Exponential backoff** with **jitter (±25%)** prevents thundering herd.
2. **Reconnect queue**: bounded at `maxQueuedMessages` (default 120), oldest dropped on overflow.
3. **User feedback**: emits `reconnecting`, `maxReconnectReached`, `offlineSuggested`.
4. **Fallback**: after `maxReconnectAttempts`, stops reconnecting.

Configuration (`config.openclaw`):
```javascript
{
  reconnectInterval: 5000,       // base delay (ms)
  maxReconnectAttempts: 20,     // 0 = unlimited
  reconnectBackoff: true,        // enable exponential backoff
  maxBackoffMs: 60000,          // cap at 60s
  offlineAfterReconnects: 10,   // emit offlineSuggested after N attempts
  heartbeatInterval: 45000,
  staleThreshold: 120000
}
```

**Server robustness:**
- No stateful session; any client can reconnect anytime.
- No sticky affinity; load‑balancing possible.
- `/ws-status` exposes current client list and lifetime counters.

## Monitoring & Diagnostics

### `/ws‑status` Endpoint

**GET** `http://<host>:18789/ws-status` → JSON:

```json
{
  "status": "healthy",
  "clients": 2,
  "uptime": 3600,
  "lastEvent": "agent.message.delta",
  "lastEventAt": 1747392000000,
  "lastEventAgeSec": 5,
  "counters": {
    "totalConnections": 42,
    "totalDisconnects": 40,
    "totalErrors": 2,
    "totalStaleEvictions": 1,
    "eventsEmitted": 12345,
    "messagesReceived": 9876
  },
  "connections": [
    {
      "remoteAddress": "192.168.86.36",
      "connectedAt": 1747391950000,
      "ageSec": 100,
      "lastPongAt": 1747391975000,
      "isAlive": true,
      "clientId": "webchat"
    }
  ]
}
```

**Counters** are monotonic; reset only on server restart.

**Client health** is reported via `isAlive` (true if pong received within last 60s).

### Client‑Side Statistics

`WebSocketClient.getStats()` returns:

```javascript
{
  isConnected: true,
  isConnecting: false,
  reconnectAttempts: 0,
  uptime: 3600000,
  queuedMessages: 0,
  lastEvent: 'agent.message.delta',
  lastEventAt: 1747392000000,
  staleSince: null,
  config: { /* redacted authToken */ }
}
```

## Security & Auth

**No built‑in authentication.** Assumes local network (192.168.86.0/24) or tunnel.

**Token passthrough** (optional):
- Query param: `?oc_token=...` or `?hal_ws=...`
- Config token: `config.openclaw.authToken`
- Server ignores; client includes in connect handshake under `params.auth.token`.

**HTTPS/WSS** recommended for public internet exposure.

## Failover & High Availability

**Single‑server** design. For redundancy:

1. Run HAL bot on multiple nodes (e.g., mini1, mini2).
2. DNS round‑robin / client‑side failover to `backupHost`.
3. **No session state** allows seamless migration.

**Client config:**
```javascript
{
  openclaw: {
    host: 'auto',               // auto‑detect
    port: 18789,
    backupHost: '192.168.86.24',
    backupPort: 18789
  }
}
```

## Change Log

**2026‑05‑15 (robustness upgrade):**
- Added `/ws‑status` endpoint with counters.
- Added WS‑level ping/pong stale detection (60s timeout).
- Cleaned up dead debug‑ingest fetch calls.
- Preserved existing client reconnection logic (already robust).
- Minimal server changes: 60 lines added, 30 lines removed.

**Pre‑2026‑05‑15:**
- Exponential backoff + jitter already present in client.
- Heartbeat already present in client (45s interval).
- Queue bounding already present (120 messages).
- Event forwarding unchanged.
- Static‑file serving unchanged.

## Testing

**Manual test:**
1. Start HAL bot (`node scripts/lib/hal-discord-bot.mjs`).
2. Connect browser to `http://localhost:18789/widget.html`.
3. Check WebSocket connection (F12 → Network → WS).
4. Query `/ws‑status` for metrics.
5. Kill network / suspend client → verify reconnection.
6. Leave idle > 60s → verify stale eviction.

**Integration notes:**
- Client already handles network loss, suspend/resume, tab visibility.
- Server now actively evicts zombies.
- Both sides now expose observability endpoints.

## Files

- **Server:** `/Users/leolambertini/HAL/scripts/lib/hal‑discord‑bot.mjs` (lines 924–1200)
- **Client:** `/Users/leolambertini/HAL/otaclaw/src/js/websocket‑client.js`
- **Config:** `/Users/leolambertini/HAL/otaclaw/src/js/config.js`
- **This doc:** `/Users/leolambertini/HAL/otaclaw/docs/WEBSOCKET‑PROTOCOL.md`