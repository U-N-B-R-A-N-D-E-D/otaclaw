# OtaClaw – Install (Linux)

**[ U N B R A N D E D ] - 2026**

Minimal steps to clone and run OtaClaw on Linux.

## One-liner (fresh install)

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git && cd otaclaw && ./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --user=YOUR_USER --fresh --restart-kiosk
```

Replace `YOUR_HOST` and `YOUR_USER` with your OpenClaw host and SSH user. Use `--local` for same-machine install.

## 1. Install OpenClaw

OtaClaw is a visual face for OpenClaw. Install the gateway first:

```bash
npm install -g openclaw
openclaw onboard
```

See [docs.openclaw.ai](https://docs.openclaw.ai) for full setup.

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

## No OpenClaw Yet?

Run the dev server to try the UI in demo mode:

```bash
cd otaclaw
npm start
# Open http://localhost:8080
```

Tap "Start in Demo Mode" to cycle through states. Deploy once OpenClaw is running.

---

**Credits:** Otacon concept © Kojima Productions / Konami. Open source fan project, non-commercial.
