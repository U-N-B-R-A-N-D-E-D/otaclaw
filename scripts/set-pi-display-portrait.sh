#!/usr/bin/env bash
# Set Raspberry Pi display to portrait mode (for DSI/HDMI displays).
# Usage:
#   ./scripts/set-pi-display-portrait.sh [HOST] [USER]   # diagnose
#   ./scripts/set-pi-display-portrait.sh --apply YOUR_HOST YOUR_USER   # add display_lcd_rotate=3 and reboot
#
# For DSI LCD (480x320): display_lcd_rotate in /boot/firmware/config.txt
#   display_lcd_rotate=1  # 90°
#   display_lcd_rotate=3  # 270° (portrait)
# Then: sudo reboot

set -e
APPLY=false
HOST="${1:-localhost}"
USER="${2:-admin}"
[[ "$1" == "--apply" ]] && { APPLY=true; HOST="${2:-localhost}"; USER="${3:-admin}"; }
echo "=== Current display ==="
DISPLAY=:0 xrandr --current 2>/dev/null || echo "xrandr not available"

echo ""
echo "=== For DSI LCD (Waveshare, etc.) ==="
CONFIG="/boot/firmware/config.txt"
[[ -f "$CONFIG" ]] || CONFIG="/boot/config.txt"
if [[ -f "$CONFIG" ]]; then
  if grep -q "display_lcd_rotate" "$CONFIG" 2>/dev/null; then
    echo "Current: $(grep display_lcd_rotate "$CONFIG")"
  else
    echo "No display_lcd_rotate found. Add to $CONFIG:"
    echo "  display_lcd_rotate=3   # 270° portrait"
    echo "Then: sudo reboot"
  fi
else
  echo "Config not found"
fi

echo ""
echo "=== Try xrandr rotation (HDMI) ==="
OUTPUT=$(DISPLAY=:0 xrandr --current 2>/dev/null | grep " connected" | head -1 | awk '{print $1}')
if [[ -n "$OUTPUT" ]]; then
  echo "Output: $OUTPUT"
  echo "To rotate: DISPLAY=:0 xrandr --output $OUTPUT --rotate right"
  echo "Or: DISPLAY=:0 xrandr --output $OUTPUT --rotate left"
fi

if [[ "$APPLY" == "true" ]]; then
  echo ""
  echo "=== Applying display_lcd_rotate=3 (portrait) on ${USER}@${HOST} ==="
  ssh -o ConnectTimeout=10 "${USER}@${HOST}" '
    CONFIG="/boot/firmware/config.txt"
    [[ -f "$CONFIG" ]] || CONFIG="/boot/config.txt"
    if ! grep -q "^display_lcd_rotate=" "$CONFIG" 2>/dev/null; then
      echo "display_lcd_rotate=3" | sudo tee -a "$CONFIG"
      echo "Added. Rebooting in 5s..."
      sleep 5 && sudo reboot
    else
      echo "Already set: $(grep display_lcd_rotate "$CONFIG")"
    fi
  '
fi
