#!/bin/bash
# OtaClaw Kiosk - Start Script
# Usage: ./start-kiosk.sh [OPENCLAW_HOST] [OPENCLAW_PORT]
#
# Connects to any OpenClaw Gateway's WebSocket server
# Works with: openclaw gateway, HAL, or any compatible WS endpoint
#
# Examples:
#   ./start-kiosk.sh                          # Uses localhost:18789
#   ./start-kiosk.sh 192.168.1.100            # Custom host, default port
#   ./start-kiosk.sh myserver.local 18789    # Custom host and port
#   OPENCLAW_HOST=10.0.0.5 ./start-kiosk.sh  # Via environment variable

set -e

# Configuration (override via args or env vars)
OPENCLAW_HOST="${1:-${OPENCLAW_HOST:-}}"
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
# Last-resort for this fleet (the host verified to respond for the Pi display)
OPENCLAW_HOST="${OPENCLAW_HOST:-192.168.86.29}"

echo "[OtaClaw] Starting kiosk..."
echo "[OtaClaw] Connecting to ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws"

# Detect OS
OS="$(uname -s)"

# ─────────────────────────────────────────────────────────────
# Linux / Raspberry Pi  (PRODUCTION PATH for pi-claw kiosk)
# This script is invoked by /home/admin/otaclaw-kiosk.sh (the systemd user service entrypoint).
# It MUST keep the browser process in foreground (exec) so the service stays Active(running).
# Always pass host/port so widget connects to the correct HAL gateway WS.
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
  
  # Start local web server if not running
  if ! pgrep -f "serve.*8080" > /dev/null; then
    echo "[OtaClaw] Starting local HTTP server on :8080..."
    npx serve . -p 8080 > /tmp/otaclaw-serve.log 2>&1 &
    sleep 2
  fi

  # Open in default browser (kiosk mode)
  CB="cb=$(date +%s)"
  open "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}&hal_ws=ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws&${CB}"
  
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
