#!/usr/bin/env bash
#
# open-widget-embed.sh - Open OtaClaw in floating widget mode (desktop).
# Use when Pi has a monitor + desktop (not kiosk). Shows compact resizable Hal.
#
# Usage: ./scripts/open-widget-embed.sh [HOST]
#   HOST: optional, default 127.0.0.1 (local OpenClaw)
#
# On Pi: DISPLAY=:0 ./scripts/open-widget-embed.sh
# On macOS: Uses 'open' (opens default browser). For Chromium: install via Homebrew.
#
set -euo pipefail

HOST="${1:-127.0.0.1}"
URL="http://${HOST}:18789/__openclaw__/canvas/otaclaw/widget.html?embed"
# Embed mode: compact 320x420, fits corner/sidebar
WIDTH="${WIDGET_WIDTH:-320}"
HEIGHT="${WIDGET_HEIGHT:-420}"

echo "Opening widget embed: $URL"
echo "  Size: ${WIDTH}x${HEIGHT} (set WIDGET_WIDTH/WIDGET_HEIGHT to override)"

if [[ "$(uname -s)" == "Darwin" ]]; then
  open "$URL"
else
exec chromium-browser \
  --app="$URL" \
  --window-size="$WIDTH,$HEIGHT" \
  --user-data-dir=/tmp/otaclaw-embed \
  --no-first-run \
  --disable-infobars \
  2>/dev/null &
fi
