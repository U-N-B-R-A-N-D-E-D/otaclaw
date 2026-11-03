#!/usr/bin/env bash
# One-command kiosk demo: starts the reference gateway and opens ONLY the kiosk.
#   macOS          -> native floating panel (tools/mac-float)
#   Linux          -> windowless Chromium kiosk
#   Windows (Git)  -> Chrome app window
# The browser widget URL is for embedding/observing; it is not opened here.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-18789}"
HOST="${HOST:-127.0.0.1}"
LOG="${TMPDIR:-/tmp}/otaclaw-demo-gateway.log"
GW_PID=""
KIOSK_PID=""

cleanup() {
  if [ -n "$KIOSK_PID" ]; then kill "$KIOSK_PID" 2>/dev/null || true; fi
  if [ -n "$GW_PID" ]; then kill "$GW_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

node examples/gateway.mjs --port "$PORT" --demo >"$LOG" 2>&1 &
GW_PID=$!

for _ in $(seq 1 40); do
  if curl -sf "http://$HOST:$PORT/src/widget.html" >/dev/null 2>&1; then break; fi
  if ! kill -0 "$GW_PID" 2>/dev/null; then
    echo "Gateway failed to start on port $PORT. See $LOG." >&2
    echo "If the port is busy, retry with: PORT=19000 npm run demo:kiosk" >&2
    exit 1
  fi
  sleep 0.25
done
if ! curl -sf "http://$HOST:$PORT/src/widget.html" >/dev/null 2>&1; then
  echo "Gateway did not become ready on port $PORT. See $LOG." >&2
  exit 1
fi

BASE="http://$HOST:$PORT/src/widget.html?host=$HOST&port=$PORT&hal_ws=ws://$HOST:$PORT/ws"

case "$(uname -s)" in
  Darwin)
    if command -v swiftc >/dev/null 2>&1; then
      if [ ! -x tools/mac-float/otaclaw-float ] || [ tools/mac-float/main.swift -nt tools/mac-float/otaclaw-float ]; then
        if ! swiftc -O tools/mac-float/main.swift -o tools/mac-float/otaclaw-float -framework Cocoa -framework WebKit; then
          echo "Native float build failed; using the Chrome app window." >&2
          rm -f tools/mac-float/otaclaw-float
        fi
      fi
    fi
    if [ -x tools/mac-float/otaclaw-float ]; then
      echo "Kiosk: native floating panel. Ctrl+C stops the gateway and the kiosk."
      tools/mac-float/otaclaw-float "$BASE&compact=1&cb=$(date +%s)" &
      KIOSK_PID=$!
      wait "$KIOSK_PID"
    elif open -Ra "Google Chrome" >/dev/null 2>&1; then
      echo "Kiosk: Chrome app window (install Xcode Command Line Tools for the native float)."
      open -na "Google Chrome" --args --app="$BASE&kiosk=1" --window-size=1100,700
      wait "$GW_PID"
    else
      echo "Install Xcode Command Line Tools (for the native float) or Google Chrome." >&2
      exit 1
    fi
    ;;
  Linux)
    if command -v chromium >/dev/null 2>&1; then
      BROWSER=chromium
    elif command -v chromium-browser >/dev/null 2>&1; then
      BROWSER=chromium-browser
    elif command -v google-chrome >/dev/null 2>&1; then
      BROWSER=google-chrome
    else
      echo "Chromium/Chrome is required for the kiosk window." >&2
      exit 1
    fi
    echo "Kiosk: $BROWSER. Ctrl+C stops the gateway and the kiosk."
    "$BROWSER" --kiosk --app="$BASE&kiosk=1" \
      --user-data-dir="${TMPDIR:-/tmp}/otaclaw-kiosk-profile" >/dev/null 2>&1 &
    KIOSK_PID=$!
    wait "$KIOSK_PID"
    ;;
  *)
    echo "Kiosk: Chrome app window. Ctrl+C stops the gateway."
    if command -v cmd.exe >/dev/null 2>&1; then
      cmd.exe /c start "" "chrome" --app="$BASE&kiosk=1" >/dev/null 2>&1
    else
      echo "Run this from Git Bash on Windows (cmd.exe is required)." >&2
      exit 1
    fi
    wait "$GW_PID"
    ;;
esac
