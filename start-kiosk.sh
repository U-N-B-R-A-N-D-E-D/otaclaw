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
OPENCLAW_HOST="${1:-${OPENCLAW_HOST:-localhost}}"
OPENCLAW_PORT="${2:-${OPENCLAW_PORT:-18789}}"

echo "[OtaClaw] Starting kiosk..."
echo "[OtaClaw] Connecting to ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws"

# Detect OS
OS="$(uname -s)"

# ─────────────────────────────────────────────────────────────
# Linux / Raspberry Pi
# ─────────────────────────────────────────────────────────────
if [ "$OS" = "Linux" ]; then
  export DISPLAY="${DISPLAY:-:0}"
  export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"

  # Disable screen power management (optional, for kiosk displays)
  xset -dpms 2>/dev/null || true
  xset s off 2>/dev/null || true
  xset s noblank 2>/dev/null || true

  # Kill old chromium processes
  pkill -9 chromium 2>/dev/null || true
  sleep 1

  # Start local web server if not running
  cd "$(dirname "$0")"
  if ! pgrep -f "serve.*8080" > /dev/null; then
    echo "[OtaClaw] Starting local HTTP server on :8080..."
    nohup npx serve . -p 8080 > /tmp/otaclaw-serve.log 2>&1 &
    sleep 2
  fi

  # Start Chromium in kiosk mode
  chromium-browser \
    --kiosk \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --password-store=basic \
    --no-first-run \
    --noerrdialogs \
    --disable-infobars \
    --start-fullscreen \
    "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}" \
    > /tmp/otaclaw-chromium.log 2>&1 &

  echo "[OtaClaw] Kiosk started (Linux/Pi)"
  echo "[OtaClaw] Logs: /tmp/otaclaw-chromium.log"

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
  open "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}"
  
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
  start "http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}" 2>/dev/null || \
    echo "[OtaClaw] Open in browser: http://localhost:8080/src/widget.html?kiosk=1&host=${OPENCLAW_HOST}&port=${OPENCLAW_PORT}"
fi

echo ""
echo "[OtaClaw] ✅ Ready!"
echo "[OtaClaw] WebSocket: ws://${OPENCLAW_HOST}:${OPENCLAW_PORT}/ws"
echo "[OtaClaw] Widget: http://localhost:8080/src/widget.html"
