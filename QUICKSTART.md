# Quick start

**[ U N B R A N D E D ] - 2026**

From clone to a reacting face in under two minutes. No gateway install, no API
key.

## Prerequisites

- Node.js 16+ (18/20 recommended)
- A modern browser

## 1. Run the demo

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw
npm install
npm run gateway:demo
```

Open the printed URL. The reference gateway serves the app and simulates a
thinking → reply → success cycle every 3 seconds.

Stop it with Ctrl+C. To run the gateway without the simulated cycle:

```bash
npm run gateway
```

If port 18789 is already used by your agent gateway, pick another:

```bash
npm run gateway -- --port 18800
# widget: http://127.0.0.1:18800/src/widget.html?host=127.0.0.1&port=18800&hal_ws=ws://127.0.0.1:18800/ws
```

## 2. Drive it from your agent

One HTTP call per event, from anywhere:

```bash
curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.start","payload":{"content":"Reading the repo…"}}'

curl -X POST http://127.0.0.1:18789/internal/notify \
  -H 'Content-Type: application/json' \
  -d '{"event":"agent.message.complete","payload":{"content":"Done: 3 files.","bubble":"Done: 3 files."}}'
```

`content` is the full reply (logs/chat); `bubble` is the one-line avatar voice.
Without `bubble`, the face summarizes `content` locally.

Next: [docs/BRING-YOUR-OWN-AGENT.md](docs/BRING-YOUR-OWN-AGENT.md).

## 3. Pick a mode

### Widget (resizable / iframe)

```html
<iframe src="http://YOUR_HOST:18789/src/widget.html?host=YOUR_HOST&port=18789&hal_ws=ws://YOUR_HOST:18789/ws"
  width="240" height="320" style="border:none; border-radius:12px;"></iframe>
```

### Fullscreen / kiosk

```bash
chromium --kiosk --app=http://YOUR_HOST:18789/src/widget.html
```

Long-press (~1 s) or tap the gear for face rotation, full window and backdrop.

### Desktop companion / floating HUD

- **macOS:** `./start-kiosk.sh` opens the native always-on-top panel (180×320,
  sprite size in the gear menu).
- **Linux/Windows:** open the widget in a small Chrome/Brave app window
  (`--app="<URL>"`).

See [docs/DESKTOP-KIOSK.md](docs/DESKTOP-KIOSK.md).

## 4. Configuration (optional)

```bash
cp config/config.example.js config/config.js
```

Defaults work when the page is served by the gateway (`host: 'auto'`). For a
remote gateway set `gateway.host` / `gateway.port`, or use the URL params above.
Full reference: [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).

---

**Credits:** Otacon concept © Kojima Productions / Konami. Fan project; see
[NOTICE](NOTICE).
