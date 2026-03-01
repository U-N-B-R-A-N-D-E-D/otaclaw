# OtaClaw – Quick Start

**[ U N B R A N D E D ] - 2026**

Clone and run in a ClawedBot/OpenClaw environment in under 2 minutes.

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- Node.js 16+ (for `npx serve` if testing locally)

See [INSTALL.md](INSTALL.md) for step-by-step Linux install.

## 1. Clone and Deploy

```bash
git clone https://github.com/U-N-B-R-A-N-D-E-D/otaclaw.git
cd otaclaw
./deploy/deploy-to-openclaw.sh --local
```

For remote host:

```bash
./deploy/deploy-to-openclaw.sh --host=YOUR_OPENCLAW_HOST --user=YOUR_USER
```

## 2. Choose Your Mode

The deploy script prints a **local network URL with token** (e.g. `http://192.168.1.10:18789/__openclaw__/canvas/otaclaw/widget.html?oc_token=...`). Open it from any device on your LAN.

### Mode A: Resizable Floating Widget

A resizable, floating widget on your Linux desktop (reasonable size limits).

1. Open the URL from the deploy output in a normal browser window.
2. Use your window manager to make it floating, or run in a small resizable window.
3. Add `?embed` for resizable compact mode, or use iframe:

```html
<iframe src="http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html?embed"
  width="240" height="320" style="border:none; border-radius:12px;"></iframe>
```

For a floating window: open the `?embed` URL in a small window and use your window manager to keep it on top.

### Mode B: Fullscreen + Rotation Controls

Dedicated display (Raspberry Pi, tablet, second monitor) with rotation and display tools.

1. Run Chromium in kiosk mode:

```bash
chromium --kiosk --app=http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html
```

2. **Choose display**: Use `xrandr` or your DE to select output before launching.
3. **Rotation & controls**: Long-press (~1 s) anywhere or tap the ⚙ button:
   - Face rotation (0°, 90° CW, 180°, 270° CW)
   - Full window toggle
   - Backdrop color

See [docs/PI-DISPLAY-SETUP.md](docs/PI-DISPLAY-SETUP.md) for Raspberry Pi + small LCD setup.

## 3. Config (Optional)

Default `host: 'auto'` works when the page is served from OpenClaw. Override in `config/config.js` or the widget's inline config:

```javascript
openclaw: { host: 'YOUR_OPENCLAW_HOST', port: 18789, wsPath: '/ws' }
```

---

**Credits:** Otacon concept © Kojima Productions / Konami. This is an open source fan project, non-commercial.
