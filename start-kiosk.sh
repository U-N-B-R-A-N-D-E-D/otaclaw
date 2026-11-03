#!/bin/bash
# OtaClaw Kiosk - Start Script
# Usage: ./start-kiosk.sh [OPENCLAW_HOST] [OPENCLAW_PORT]
#
# Connects to any OpenClaw Gateway's WebSocket server
# Works with OpenClaw or any compatible WebSocket endpoint
#
# Examples:
#   ./start-kiosk.sh                          # Uses localhost:18789
#   ./start-kiosk.sh 192.0.2.100            # Custom host, default port
#   ./start-kiosk.sh myserver.local 18789    # Custom host and port
#   OPENCLAW_HOST=192.0.2.100 ./start-kiosk.sh  # Via environment variable

set -e

# Help
case "${1:-}" in
  -h|--help)
    cat <<'EOF'
Usage: ./start-kiosk.sh [--browser] [HOST] [PORT]

  --browser        open a Chrome/Brave app window instead of the native panel (macOS)
  HOST             event gateway host (default: config/config.js, then localhost)
  PORT             event gateway port (default: 18789)

Environment:
  OPENCLAW_HOST    gateway host (same as HOST)
  OPENCLAW_PORT    gateway port (same as PORT)
  OTACLAW_PORT     local static server port on macOS (default: 8899)
EOF
    exit 0 ;;
esac

# Launch mode: "float" (native panel on macOS) or "browser" (app window)
LAUNCH_MODE="float"
case "${1:-}" in
  --browser|--chrome|--no-float) LAUNCH_MODE="browser"; shift ;;
esac

# Configuration (override via args or env vars)
EXPLICIT_HOST=0
if [ -n "${1:-}" ]; then
  OPENCLAW_HOST="$1"
  EXPLICIT_HOST=1
elif [ -n "${OPENCLAW_HOST:-}" ]; then
  EXPLICIT_HOST=1
else
  OPENCLAW_HOST=""
fi
OPENCLAW_PORT="${2:-${OPENCLAW_PORT:-18789}}"

# Resolve target host from the deployed otaclaw config when not explicitly passed.
# This makes kiosk follow the single source of truth (config/config.js) after deploy.
if [ -z "$OPENCLAW_HOST" ] || [ "$OPENCLAW_HOST" = "localhost" ] || [ "$OPENCLAW_HOST" = "auto" ]; then
  if [ -f config/config.js ]; then
    cfg_host=$(grep -oE "host:[[:space:]]*['\"][^'\"]+['\"]" config/config.js 2>/dev/null | head -1 | sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/" || true)
    if [ -n "$cfg_host" ] && [ "$cfg_host" != "auto" ]; then
      OPENCLAW_HOST="$cfg_host"
    fi
  fi
fi
# Last-resort default (connect to the gateway on localhost)
OPENCLAW_HOST="${OPENCLAW_HOST:-localhost}"

# Detect OS
OS="$(uname -s)"

# On macOS, prefer a local gateway on 18789 unless the user passed a host explicitly
if [ "$OS" = "Darwin" ] && [ "$EXPLICIT_HOST" -eq 0 ]; then
  if lsof -i :18789 >/dev/null 2>&1; then
    OPENCLAW_HOST="127.0.0.1"
  fi
fi

echo "[OtaClaw] Starting kiosk..."
echo "[OtaClaw] Connecting to ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws"

# ─────────────────────────────────────────────────────────────
# Linux / Raspberry Pi  (production path for a Pi kiosk)
# This script is invoked by <HOME>/otaclaw-kiosk.sh (the systemd user service entrypoint).
# It MUST keep the browser process in foreground (exec) so the service stays Active(running).
# Always pass host/port so widget connects to the correct gateway WS.
# ─────────────────────────────────────────────────────────────
if [ "$OS" = "Linux" ]; then
  export DISPLAY="${DISPLAY:-:0}"
  export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

  # Disable screen power management (optional, for kiosk displays)
  xset -dpms 2>/dev/null || true
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true

  # Kill old chromium processes (idempotent)
  pkill -9 chromium 2>/dev/null || true
  pkill -9 chromium-browser 2>/dev/null || true
  sleep 1

  # Start local web server if not running (reuse if already up)
  cd "$(dirname "$0")"
  if ! pgrep -f "serve.*8080" > /dev/null; then
    echo "[OtaClaw] Starting local HTTP server on :8080..."
    nohup npx serve . -p 8080 > /tmp/otaclaw-serve.log 2>&1 &
    sleep 2
  fi

  # Choose correct chromium binary for this Pi / Linux env
  CHROMIUM_CMD="chromium-browser"
  if ! command -v "$CHROMIUM_CMD" >/dev/null 2>&1; then
    CHROMIUM_CMD="chromium"
  fi

  # Cache-bust to ensure latest widget + JS after deploy (no stale sprites/seqs)
  CB="cb=$(date +%s)"

  echo "[OtaClaw] Launching Chromium kiosk (exec, foreground for systemd) using ${CHROMIUM_CMD}"
  echo "[OtaClaw] Widget: http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&hal_ws=ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws&${CB}"

  # IMPORTANT: exec so this process becomes the browser; service tracks it and restart works cleanly.
  exec "$CHROMIUM_CMD" \
    --kiosk \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --password-store=basic \
    --no-first-run \
    --noerrdialogs \
    --disable-infobars \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --start-fullscreen \
    "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&hal_ws=ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws&${CB}" \
    > /tmp/otaclaw-chromium.log 2>&1

  # (never reached)

# ─────────────────────────────────────────────────────────────
# macOS
# ─────────────────────────────────────────────────────────────
elif [ "$OS" = "Darwin" ]; then
  cd "$(dirname "$0")"
  
  PORT="${OTACLAW_PORT:-8899}"
  # Start local web server if not running
  if ! lsof -i ":$PORT" > /dev/null 2>&1; then
    echo "[OtaClaw] Starting local HTTP server on :$PORT..."
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory . > /tmp/otaclaw-mac-serve.log 2>&1 &
    sleep 1
  fi

  CB="cb=$(date +%s)"
  WIDGET_URL="http://127.0.0.1:${PORT}/src/widget.html?host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&hal_ws=ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws&${CB}"
  FLOAT_URL="${WIDGET_URL}&compact=1"

  FLOAT_BIN="tools/mac-float/otaclaw-float"

  # 1. Native floating panel (always on top + all Spaces + no window chrome)
  if [ "$LAUNCH_MODE" = "float" ]; then
    if command -v swiftc >/dev/null 2>&1 && [ -f "tools/mac-float/main.swift" ] && { [ ! -x "$FLOAT_BIN" ] || [ "tools/mac-float/main.swift" -nt "$FLOAT_BIN" ]; }; then
      echo "[OtaClaw] Compiling native floating HUD helper..."
      mkdir -p tools/mac-float
      swiftc -O tools/mac-float/main.swift -o "$FLOAT_BIN" -framework Cocoa -framework WebKit 2>/dev/null || true
    fi
    if [ -x "$FLOAT_BIN" ]; then
      echo "[OtaClaw] Launching native floating panel (always on top / all Spaces / no window chrome)..."
      nohup "$FLOAT_BIN" "$FLOAT_URL" > /tmp/otaclaw-float.log 2>&1 &
      echo "[OtaClaw] ✅ Native floating widget active! (Drag anywhere to move)"
      echo "[OtaClaw] Tip: Use ./start-kiosk.sh --browser for standard Chrome app window."
      exit 0
    fi
  fi

  # 2. Browser app window (Chrome / Brave app mode)
  if [ -d "/Applications/Google Chrome.app" ]; then
    echo "[OtaClaw] Launching Chrome app window (frameless, 360x480)..."
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --app="$WIDGET_URL" \
      --window-size=360,480 \
      --user-data-dir="/tmp/otaclaw-chrome-profile" \
      >/dev/null 2>&1 &
  elif [ -d "/Applications/Brave Browser.app" ]; then
    echo "[OtaClaw] Launching Brave app window (frameless, 360x480)..."
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
      --app="$WIDGET_URL" \
      --window-size=360,480 \
      --user-data-dir="/tmp/otaclaw-chrome-profile" \
      >/dev/null 2>&1 &
  else
    echo "[OtaClaw] Opening in default browser..."
    open "$WIDGET_URL"
  fi
  
  echo "[OtaClaw] Opened in browser (macOS)"
  echo "[OtaClaw] For fullscreen: press ⌃⌘F or use View > Enter Full Screen"

# ─────────────────────────────────────────────────────────────
# Windows (WSL/Git Bash)
# ─────────────────────────────────────────────────────────────
else
  cd "$(dirname "$0")"
  
  echo "[OtaClaw] Starting local HTTP server on :8080..."
  npx serve . -p 8080 &
  sleep 2

  # Try to open in browser
  CB="cb=$(date +%s)"
  start "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&hal_ws=ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws&${CB}" 2>/dev/null || \
    echo "[OtaClaw] Open in browser: http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&${CB}"
fi

echo ""
echo "[OtaClaw] ✅ Ready!"
echo "[OtaClaw] WebSocket: ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws"
echo "[OtaClaw] Widget: http://localhost:8080/src/widget.html"
