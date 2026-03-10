#!/usr/bin/env bash
# Hide cursor on Raspberry Pi kiosk (run from Mac, SSHs to Pi)
# Usage: ./scripts/hide-cursor-on-pi.sh [HOST] [USER]
# Example: ./scripts/hide-cursor-on-pi.sh YOUR_HOST YOUR_USER

set -e
HOST="${1:-localhost}"
USER="${2:-admin}"

echo "=== Hiding cursor on ${USER}@${HOST} ==="

# 1. Install unclutter if missing
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
  if ! command -v unclutter >/dev/null; then
    echo 'Installing unclutter...'
    sudo apt-get update -qq && sudo apt-get install -y unclutter
  fi
"

# 2. Configure X server to not draw cursor (most reliable)
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
  if [[ -f /etc/lightdm/lightdm.conf ]]; then
    if grep -q 'xserver-command=X -nocursor' /etc/lightdm/lightdm.conf; then
      echo 'X -nocursor already configured'
    else
      echo 'Adding xserver-command=X -nocursor to lightdm...'
      sudo sed -i 's/^#*xserver-command=.*/xserver-command=X -nocursor/' /etc/lightdm/lightdm.conf
      if ! grep -q 'xserver-command' /etc/lightdm/lightdm.conf; then
        echo '[Seat:*]' | sudo tee -a /etc/lightdm/lightdm.conf
        echo 'xserver-command=X -nocursor' | sudo tee -a /etc/lightdm/lightdm.conf
      fi
      echo 'Done. Reboot required: sudo reboot'
    fi
  else
    echo 'lightdm.conf not found, using unclutter only'
  fi
"

# 3. Start unclutter now (no reboot needed)
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
  pkill -x unclutter 2>/dev/null || true
  DISPLAY=:0 unclutter -idle 0 -root -noevents &
  echo 'unclutter started'
"

echo ""
echo "If cursor still visible after reboot, run: ssh ${USER}@${HOST} 'sudo reboot'"
