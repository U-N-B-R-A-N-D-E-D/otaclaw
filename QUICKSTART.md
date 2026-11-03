# Quick start

**[ U N B R A N D E D ] - 2026**

From clone to a reacting face in under two minutes. No gateway install, no API
key.

## Prerequisites

- Node.js 16+ (18/20 recommended)
- A modern browser

## 1. Run the kiosk demo

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw
npm install
npm run demo:kiosk
```

It starts the reference gateway and opens **only the kiosk**: the native float
on macOS, or a windowless Chromium/app window on Linux/Windows. No browser tab
and no landing page. The face reacts to a simulated thinking → reply → success
cycle every 3 seconds. Ctrl+C stops the gateway and the kiosk.

If port 18789 is busy:

```bash
PORT=19000 npm run demo:kiosk
```

To run the gateway headlessly (BYOA, embedding, or your own browser), use:

```bash
npm run gateway
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

## 3. The one window: kiosk or embed

The default is the kiosk from step 1. It is the only window the demo opens.

- **macOS:** `npm run demo:kiosk` opens the native always-on-top float (180×320;
  sprite size in the gear menu).
- **Linux/Windows:** `npm run demo:kiosk` opens a windowless Chromium/app kiosk.
- **Live agent:** `./start-kiosk.sh` opens the same native float against your
  configured gateway.
- **Embedding:** use the widget URL in an iframe/your own UI; that is the embed
  surface, not the kiosk demo:

```html
<iframe src="http://YOUR_HOST:18789/src/widget.html?host=YOUR_HOST&port=18789&hal_ws=ws://YOUR_HOST:18789/ws"
  width="240" height="320" style="border:none; border-radius:12px;"></iframe>
```

Long-press (~1 s) or tap the gear for face rotation, full window and backdrop.

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
