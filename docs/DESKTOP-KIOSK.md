# Desktop kiosk & companion mode

Run OtaClaw on a normal desktop as a kiosk/companion instead of dedicated
hardware. The macOS floating panel is the reference setup; the same widget runs
on Linux/Windows, a second monitor, a tablet, or a Raspberry Pi.

## 1. The idea

OtaClaw is a static HTML5 app: no build step and no extra hardware. On a desktop
it runs as a frameless kiosk that looks like an in-game HUD, with no tab strip,
address bar, bookmarks or window chrome. The optional macOS helper compiles once
with `swiftc`; everything else is static.

```bash
# Demo gateway + the only kiosk window (no browser tab/landing)
npm run demo:kiosk

# Live agent, same float/windowless kiosk
./start-kiosk.sh
```

## 2. macOS: floating panel and Spaces

Two macOS behaviors get in the way of a usable kiosk:

1. **Occlusion.** When you focus another app, a normal browser window ends up behind it.
2. **Spaces.** macOS pins each window to one Space, so it stays behind when you switch desktops or enter full screen.

### Mode A: native floating panel (recommended)

Source: `tools/mac-float/main.swift`. A small Swift binary built on `Cocoa` +
`WebKit` (`WKWebView`) — no Electron, no extra runtime.

- `panel.level = .floating` keeps it above normal windows.
- `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]` follows you
  across Spaces and full-screen apps.
- Borderless: no title bar or buttons. Drag anywhere on the canvas to move it;
  the position is remembered. Right-click for **Toggle Codec Mode / Reload /
  Close**. The gear appears on hover: **Codec mode → Toggle codec**, rotation,
  full window, backdrop and sprite size. It fades out after a few idle seconds.
- `Cmd+R` reloads, `Cmd+Q` / `Cmd+W` closes. Click the panel once to give the
  page keyboard focus (Konami code, shortcuts).
- `activationPolicy = .accessory`: no Dock icon and it does not take over the
  active app.
- **Compact 9:16 panel.** Fixed 180×320 window; the sprite auto-fits the
  available height (~2.5×, 175 px tall) and the bubble uses the strip above it.
  The sprite size can be adjusted in the gear menu (60–160%). It never grows
  past the window: the bubble is capped and the model stays bottom-anchored.
- The floating URL uses `?compact=1` (the auto scale is derived from the window;
  no fixed `scale` param).

### Mode B: platform kiosk window (Linux/Windows fallback)

`npm run demo:kiosk` picks the windowless kiosk automatically: Chromium `--kiosk`
on Linux and a Chrome app window on Windows. If the macOS Swift helper cannot be
built, the same launcher falls back to a Chrome app window on macOS. This is a
fallback for the single kiosk surface, not a second approved window type.

## 3. Displays and multiple monitors

The widget is just a URL; any display can host it.

- **Mac kiosk (default):** `npm run demo:kiosk` (demo) or `./start-kiosk.sh`
  (live agent) opens the floating panel.
- **Fullscreen on one display:** `./start-kiosk.sh --browser`, move the app
  window to the target monitor, then `⌃⌘F`.
- **Another monitor:** drag the floating panel there; it follows Spaces and
  full-screen apps. Or keep the browser app window on the second display.
- **One face per display:** run one instance per display against the same
  gateway. All of them receive the same events; tickle is synced between them
  via `client.interaction`.
- **Any browser/tablet:** open
  `http://<HOST>:<PORT>/src/widget.html?host=<HOST>&port=<PORT>&hal_ws=ws://<HOST>:<PORT>/ws`.
  Nothing to install.
- **Raspberry Pi (optional):** the public repo still supports a Pi kiosk via the
  Linux path of `start-kiosk.sh`. It is not required for a desktop kiosk.

## 4. Running it

From the repository root:

```bash
# macOS default: native floating panel across all Spaces
./start-kiosk.sh

# Force the browser app window instead
./start-kiosk.sh --browser

# Point at a specific gateway
OPENCLAW_HOST=127.0.0.1 OTACLAW_PORT=8899 ./start-kiosk.sh
```

On macOS the script starts a local static server on `127.0.0.1:8899` (override
with `OTACLAW_PORT`) and then opens the widget. It prefers `127.0.0.1`
automatically when a gateway is already listening on port 18789.

## 5. Ports

| Service | Port | Notes |
| :--- | :---: | :--- |
| OtaClaw static server (start-kiosk) | `8899` | Configurable via `OTACLAW_PORT`. A non-8080 default avoids collisions with common local dev proxies. |
| Reference gateway (static + WS) | `18789` | `npm run gateway`; also serves the widget, so `start-kiosk.sh` can reuse it. |
| Event gateway (WebSocket) | `18789` | Any gateway that speaks the [WebSocket protocol](WEBSOCKET-PROTOCOL.md). |

## 6. Building the floating helper

`start-kiosk.sh` recompiles the helper when `main.swift` is newer. To rebuild it
manually:

```bash
cd tools/mac-float
swiftc -O main.swift -o otaclaw-float -framework Cocoa -framework WebKit
```

The compiled binary is git-ignored; only `main.swift` is tracked.
