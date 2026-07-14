# OtaClaw – Install (Linux)

**[ U N B R A N D E D ] - 2026**

Minimal steps to clone and run OtaClaw on Linux.

## One-liner (fresh install)

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git && cd otaclaw && ./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --user=YOUR_USER --fresh --restart-kiosk
```

Replace `YOUR_HOST` and `YOUR_USER` with your OpenClaw host and SSH user. Use `--local` for same-machine install.

## 1. Install a Compatible Gateway

OtaClaw is a visual face for **any** event gateway that speaks the WebSocket protocol in [docs/WEBSOCKET-PROTOCOL.md](docs/WEBSOCKET-PROTOCOL.md).

**OpenClaw (optional):**

```bash
npm install -g openclaw
openclaw onboard
```

See [docs.openclaw.ai](https://docs.openclaw.ai) for full setup. HAL Discord bot and custom bridges work the same way — point `gateway.host` / `gateway.port` at your WS endpoint.

## 2. Clone and Deploy

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw
./deploy/deploy-to-openclaw.sh --local
```

## 3. Open in Browser

```
http://localhost:18789/__openclaw__/canvas/otaclaw/
```

Or for the widget: `http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html`

## Remote Host (e.g. Raspberry Pi)

```bash
./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --user=YOUR_USER --fresh --restart-kiosk
```

- `--fresh` – Remove existing install first (clean, like fresh clone)
- `--restart-kiosk` – Restart kiosk service after deploy

Then open `http://YOUR_HOST:18789/__openclaw__/canvas/otaclaw/widget.html`

## Config Locations

| Context | Config path |
|---------|-------------|
| **Development** (from repo, `npm start`) | `config/config.js` (copy from `config/config.example.js`) |
| **Deployed** (OpenClaw canvas) | `~/.openclaw/canvas/otaclaw/js/config.js` |

Edit the config for your setup (host, port, states, sprites). See [docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md).

## No Gateway Yet?

Run the dev server to try the UI in demo mode:

```bash
cd otaclaw
npm start
# Open http://localhost:8080
```

Tap "Start in Demo Mode" to cycle through states. Deploy once your gateway is running.

---

**Credits:** Otacon concept © Kojima Productions / Konami. Open source fan project, non-commercial.
