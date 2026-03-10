# Local Testing (No Repo Upload)

Test OtaClaw against your OpenClaw before publishing.

## Option A: OpenClaw on This Machine

If OpenClaw gateway runs on your Mac/laptop (localhost):

```bash
# 1. Ensure OpenClaw is running
openclaw gateway   # or however you start it; port 18789

# 2. Deploy OtaClaw into local canvas
cd otaclaw
./deploy/deploy-to-openclaw.sh --local

# 3. Open in browser
open http://localhost:18789/__openclaw__/canvas/otaclaw/
```

Config: `~/.openclaw/canvas/otaclaw/js/config.js` — host should be `localhost`.

---

## Option B: OpenClaw on a Remote Host (Pi, etc.)

**Important:** By default the gateway binds to `loopback` — remote browsers can't reach it. Use the setup script to fix that and deploy:

```bash
./scripts/setup-pi-test.sh YOUR_PI_HOST YOUR_USER
```

Then open: `http://YOUR_PI_HOST:18789/__openclaw__/canvas/otaclaw/`

**Config:** Default `host: 'auto'` uses the same host as the page.

---

## Option B2: OpenClaw on Another Machine (generic)

If the gateway runs on a remote host:

```bash
./deploy/deploy-to-openclaw.sh --host=YOUR_OPENCLAW_HOST --user=YOUR_USER
open http://YOUR_OPENCLAW_HOST:18789/__openclaw__/canvas/otaclaw/
```

Edit config if needed:
```bash
ssh YOUR_USER@YOUR_OPENCLAW_HOST 'nano ~/.openclaw/canvas/otaclaw/js/config.js'
```

---

## Option C: Dev Server (No OpenClaw Canvas)

If OpenClaw is not running yet, or you just want to try the UI:

```bash
cd otaclaw
npm start
# Open http://localhost:8080
# Tap "Start in Demo Mode" — cycles states with NES reactions
# Press F for full frame cycle
```

Then later deploy once the gateway is up.

---

## Quick Check

| What you have | Command |
|---------------|---------|
| OpenClaw on this Mac | `./deploy/deploy-to-openclaw.sh --local` |
| OpenClaw on remote host | `./deploy/deploy-to-openclaw.sh --host=YOUR_HOST` |
| No OpenClaw running | `npm start` → Demo mode |

---

## Verifying Connection

1. Open OtaClaw in the browser.
2. Status bar: green dot + "Connected" = WebSocket OK.
3. Send a message via your usual OpenClaw chat (Discord, MCP, etc.).
4. OtaClaw should react: Thinking → Processing → Got it! (or Woah! on tool call).

If the dot stays red, the WebSocket URL or host in config is wrong.
