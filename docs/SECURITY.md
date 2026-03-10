# OtaClaw Security

**Repo policy:** No secrets, no hardcoded paths, no Spanish in committed files. Use placeholders (`YOUR_HOST`, `YOUR_IP`) in docs. Keep tokens in `config.js` (gitignored) or inject at runtime.

## Token Handling

OtaClaw connects to the OpenClaw Gateway via WebSocket. When the gateway requires authentication (protocol v3), a token is used.

### Where the token comes from

1. **URL parameter** (preferred at runtime): `?oc_token=...`, `?openclaw_token=...`, or `?gateway_token=...`
2. **Config**: `config.openclaw.authToken` in `config.js` or inline config

URL parameters take precedence over config. Use URL params when the token is injected at runtime (e.g. kiosk script reading from `openclaw.json`).

### Security practices

- **Never commit tokens** to version control. Use `config.example.js` as a template; keep real tokens in `config.js` (gitignored) or inject via URL.
- **Never log tokens**. OtaClaw redacts `authToken` in debug output and `getStats()`.
- **Same-origin recommended**. When OtaClaw is served from the OpenClaw canvas (`/__openclaw__/canvas/otaclaw/`), it runs on the same origin as the gateway. For remote hosts, ensure CORS and WebSocket policies allow the connection.
- **Deploy-time injection**. For remote installs, inject the token via the kiosk launch script or a server-side template. Do not hardcode in committed files.

### Kiosk token injection

The Pi kiosk script (`scripts/setup-pi-kiosk.sh`) reads the token from `~/.openclaw/openclaw.json` and appends `?oc_token=...` to the widget URL at launch. This keeps the token out of static files.

## CORS and Same-Origin

When OtaClaw is served by the OpenClaw gateway (default deployment), it is same-origin with the WebSocket endpoint. No CORS issues.

When served from a different origin (e.g. static file server), the WebSocket connection may be subject to browser security policies. Use the same host as the gateway when possible, or ensure the gateway allows the origin.

## Data and Privacy

OtaClaw is a visual face for OpenClaw. It receives events (e.g. `agent.message.start`, `agent.message.complete`) to drive animations. It does not store conversation content. All data stays between your OpenClaw instance and your devices.
