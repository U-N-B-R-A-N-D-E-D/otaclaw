# OpenClaw Integration Guide

OtaClaw is a visual face for OpenClaw — an animated companion that accompanies your interactions with the gateway. This guide explains how to integrate OtaClaw with your OpenClaw gateway.

## Overview

OtaClaw connects to OpenClaw's WebSocket API to receive real-time events and react with emotional states. No modifications to OpenClaw are required - OtaClaw works as a standalone client.

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- OpenClaw Gateway accessible via network
- WebSocket support enabled in OpenClaw (default)

## Connection Configuration

### 1. Find Your OpenClaw Gateway URL

Check your OpenClaw configuration:

```bash
# On the machine running OpenClaw
cat ~/.openclaw/openclaw.json | grep -A 5 gateway
```

Look for:
```json
{
  "gateway": {
    "port": 18789,
    "bind": "0.0.0.0"
  }
}
```

Your WebSocket URL will be:
- `ws://localhost:18789/ws` (same machine)
- `ws://your-openclaw-host:18789/ws` (local network)
- `ws://raspberrypi.local:18789/ws` (hostname)

### 2. Configure OtaClaw

Edit `config/config.js`:

```javascript
export const OTACLAW_CONFIG = {
  openclaw: {
    host: 'YOUR_OPENCLAW_HOST',  // Your OpenClaw IP or hostname
    port: 18789,           // Gateway port
    wsPath: '/ws',         // WebSocket endpoint
    reconnectInterval: 5000,
  },
  // ... rest of config
};
```

### 3. Deploy and Test

```bash
# Deploy to OpenClaw Canvas
./deploy/deploy-to-openclaw.sh --host=your-openclaw-host

# Open in browser
http://your-openclaw-host:18789/__openclaw__/canvas/otaclaw/
```

You should see:
- Otacon avatar in "idle" state
- Green connection indicator (if connected)
- State changes when OpenClaw processes messages

## Event Mapping

OtaClaw listens to OpenClaw events and maps them to emotional states:

| OpenClaw Event | OtaClaw State | Description |
|----------------|----------------|-------------|
| `agent.message.start` | `thinking` | User sent message |
| `agent.message.delta` | `processing` | AI generating response |
| `agent.message.complete` | `success` | Response finished |
| `agent.message.error` | `error` | Something went wrong |
| `agent.tool.call` | `surprised` | Tool/function called |
| `gateway.idle` | `idle` | No activity |
| `gateway.error` | `error` | Gateway error |

### Semantic Frame Selection (Clawdbot)

For context-aware expressions, emit `otaclaw.frame` with direct cell coordinates:

```json
{ "type": "otaclaw.frame", "col": 9, "row": 0 }
```

Clawdbot can use the frame catalog (`src/data/frame-catalog.json`) to pick the best frame by tags (e.g. unpleasant topic → frame 9,0 or 10,0 with tags "surprised", "scared").

### Custom Event Mapping

Modify `config/config.js` to customize:

```javascript
eventMap: {
  // Map custom events to states
  'my.custom.event': 'laughing',
  'agent.code.execute': 'thinking',
  
  // Override defaults
  'agent.message.start': 'surprised',  // Different reaction
}
```

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket('ws://localhost:18789/ws');

ws.onopen = () => {
  // Send handshake
  ws.send(JSON.stringify({
    type: 'client.connect',
    client: 'otaclaw',
    version: '1.0.0'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  handleEvent(data);
};
```

### Event Format

OpenClaw sends events as JSON:

```javascript
{
  "type": "agent.message.start",
  "timestamp": 1699900000000,
  "data": {
    "agentId": "main",
    "messageId": "msg_123"
  }
}
```

### Sending Messages

OtaClaw can also send messages to OpenClaw:

```javascript
// Ping/keepalive
ws.send(JSON.stringify({
  type: 'client.ping'
}));

// Request refresh
ws.send(JSON.stringify({
  type: 'client.refresh'
}));
```

## Testing Connection

### Using curl

```bash
# Test HTTP endpoint
curl http://localhost:18789/__openclaw__/canvas/otaclaw/

# Test WebSocket (requires websocat or similar)
websocat ws://localhost:18789/ws
```

### Using Browser DevTools

1. Open OtaClaw in browser
2. Open DevTools (F12) → Console
3. Check WebSocket connection status:

```javascript
// Check OtaClaw status
otaclawApp.getStats();

// Check WebSocket status
wsClient.getStats();

// Manually trigger states
otaclaw.setState('success');
```

## Troubleshooting

### Connection Refused

```bash
# Verify OpenClaw is running
curl http://localhost:18789

# Check OpenClaw logs
journalctl -u openclaw-gateway -f

# Verify port is listening
sudo netstat -tlnp | grep 18789
```

### CORS Errors

If running OtaClaw on different domain than OpenClaw:

1. OpenClaw should handle CORS automatically
2. If issues persist, use the Canvas deployment method (same origin)
3. Or configure OpenClaw CORS headers in its config

### WebSocket Not Upgrading

```bash
# Test with curl
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: test" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:18789/ws
```

Should return `101 Switching Protocols`.

### Events Not Received

1. Verify event types in OpenClaw match configuration
2. Check browser console for event logs
3. Enable debug mode in OtaClaw config:

```javascript
behavior: {
  debug: true,  // Shows debug panel with 'd' key
}
```

## Advanced Integration

### Custom Agent Events

If you have custom OpenClaw agents, emit events they can use:

```javascript
// In your OpenClaw agent/tool
emit('agent.myagent.custom', {
  type: 'agent.myagent.custom',
  data: { customField: 'value' }
});
```

Map in OtaClaw config:

```javascript
eventMap: {
  'agent.myagent.custom': 'laughing',
}
```

### Bidirectional Communication

OtaClaw can send messages back to OpenClaw:

```javascript
// In OtaClaw UI code
wsClient.send({
  type: 'client.interaction',
  action: 'tap',
  state: otaclaw.getState()
});
```

Handle in OpenClaw agent:

```javascript
// Agent receives client.interaction events
on('client.interaction', (data) => {
  console.log('User tapped OtaClaw:', data);
});
```

### Health Monitoring

OtaClaw sends periodic heartbeats:

```javascript
// Automatic ping every 30s (configurable)
{
  type: 'client.ping',
  timestamp: 1699900000000
}
```

OpenClaw can detect disconnection if no ping received.

## Security

### Network Security

1. **Firewall**: Only allow OtaClaw IPs
   ```bash
   sudo ufw allow from YOUR_LAN_CIDR to any port 18789
   ```

2. **Bind Address**: Limit OpenClaw to local network
   ```json
   {
     "gateway": {
       "bind": "your-lan-ip"
     }
   }
   ```

3. **VPN**: Use WireGuard/Tailscale for remote access

### Authentication (Future)

OpenClaw may add token-based auth:

```javascript
// Future: token-based auth
ws.send(JSON.stringify({
  type: 'client.connect',
  token: 'your-token-here'
}));
```

## Integration Checklist

- [ ] OpenClaw running and accessible
- [ ] WebSocket endpoint reachable
- [ ] OtaClaw config has correct host/port
- [ ] Deployed to Canvas or CORS configured
- [ ] Connection indicator shows green
- [ ] Test message triggers state change
- [ ] Auto-reconnect working (test by restarting OpenClaw)
- [ ] Touch interactions responsive (if using touchscreen)

---

For issues specific to your OpenClaw setup, consult the [OpenClaw documentation](https://github.com/openclaw/openclaw).
