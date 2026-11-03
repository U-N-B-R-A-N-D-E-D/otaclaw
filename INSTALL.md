# Install

**[ U N B R A N D E D ] - 2026**

OtaClaw is a static app. You need Node.js 16+ to run the dev server and the
reference gateway; a modern browser is the only runtime dependency for the face.

## 1. Try it (no gateway, no keys)

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw
npm install
npm run demo:kiosk
```

It starts the reference gateway and opens **only the kiosk**: the native float on
macOS, or a windowless Chromium/app window on Linux/Windows. No browser tab and
no landing page. It simulates an agent cycle every 3 seconds. Ctrl+C stops both.

If port 18789 is busy: `PORT=19000 npm run demo:kiosk`.

## 2. Connect your agent

OtaClaw is the face, not the brain. Any process that can POST events can drive
it — no OpenClaw install required.

```bash
# Terminal 1: reference gateway + static server
npm run gateway

# Terminal 2: one call per event
curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.start","payload":{"content":"Working…"}}'
```

See [docs/BRING-YOUR-OWN-AGENT.md](docs/BRING-YOUR-OWN-AGENT.md) for the event
cheat sheet, a webhook example and Discord/Slack snippets.

## 3. Use your own gateway

If you already have a WebSocket server, implement the small protocol in
[docs/WEBSOCKET-PROTOCOL.md](docs/WEBSOCKET-PROTOCOL.md) and point the widget at
it:

```
widget.html?host=YOUR_HOST&port=18789&hal_ws=ws://YOUR_HOST:18789/ws
```

## 4. Deploy to OpenClaw (optional)

```bash
# Same machine
./deploy/deploy-to-openclaw.sh --local

# Remote host
./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --user=YOUR_USER
```

Flags:

- `--fresh` — remove the previous install first
- `--restart-kiosk` — restart the kiosk service after deploying
- `--canvas-path=PATH` — deploy under a different parent directory

OpenClaw canvas URL (if the gateway mounts it):

```
http://YOUR_HOST:18789/__openclaw__/canvas/otaclaw/widget.html?kiosk=1
```

## 5. Development / embed server

No build step for the web app. Serve the repository root with any web server for
development and embedding:

```bash
npx serve . -p 8080
# http://localhost:8080/src/index.html      (development landing)
# http://localhost:8080/src/widget.html     (widget / embed)
```

This is not the kiosk demo. The kiosk is `npm run demo:kiosk` (demo gateway +
float/windowless kiosk) or `./start-kiosk.sh` against your own gateway.

## Configuration

| Context | Config path |
|---------|-------------|
| Development (repo, `npm start`) | `config/config.js` (copy from `config/config.example.js`) |
| Deployed (default deploy target) | `~/otaclaw/config/config.js` |

`config/config.js` is git-ignored. `gateway.host: 'auto'` works when the page is
served by the gateway; otherwise set the host/port explicitly. See
[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).

## Kiosk / Raspberry Pi

The `deploy/` and `scripts/` helpers cover Chromium kiosk mode, systemd units,
touch, rotation and display setup. Start with
[deploy/kiosk-mode.md](deploy/kiosk-mode.md) and
[docs/PI-DISPLAY-SETUP.md](docs/PI-DISPLAY-SETUP.md).

## Troubleshooting

- **Face stays on the connection screen** — the widget cannot reach `/ws`.
  Check `gateway.host`, `gateway.port`, the `hal_ws` query param and the
  gateway log.
- **Port already in use** — change `OTACLAW_PORT` (reference gateway) or
  `gateway.port` (config).
- **No reactions** — confirm the event names and payloads against
  [docs/WEBSOCKET-PROTOCOL.md](docs/WEBSOCKET-PROTOCOL.md); unknown events fall
  back to idle.
- **Bubble shows a cut line** — send `bubble`/`summary` with your events for
  exact control; otherwise the face summarizes `content` locally.

---

**Credits:** Otacon concept © Kojima Productions / Konami. Fan project; see
[NOTICE](NOTICE).
