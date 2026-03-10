#!/usr/bin/env bash
#
# Setup OtaClaw fullscreen kiosk on a Raspberry Pi (Mode B).
# Deploys widget + optional static server; configures systemd auto-start.
#
# Requires: SSH to target host, Chromium, graphical session (DISPLAY=:0)
#
# Usage: ./scripts/setup-pi-kiosk.sh [YOUR_PI_HOST] [YOUR_USER] [WIDGET_URL]
# Example: ./scripts/setup-pi-kiosk.sh raspberrypi.local pi
#

set -e
HOST="${1:-}"
USER="${2:-pi}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 YOUR_PI_HOST [YOUR_USER] [WIDGET_URL]"
  echo "Example: $0 raspberrypi.local pi"
  exit 1
fi
# Default points to OpenClaw canvas path used by deploy-to-openclaw.
WIDGET_URL="${3:-http://127.0.0.1:18789/__openclaw__/canvas/otaclaw/widget.html}"

echo "=== 0. Hide cursor (unclutter + X -nocursor) ==="
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "command -v unclutter >/dev/null || (sudo apt-get update -qq && sudo apt-get install -y unclutter 2>/dev/null) || echo 'Install: sudo apt install unclutter'"
# X server -nocursor hides at display level (more reliable than unclutter)
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
if [[ -f /etc/lightdm/lightdm.conf ]]; then
  if ! grep -q 'xserver-command=X -nocursor' /etc/lightdm/lightdm.conf; then
    echo 'To hide cursor permanently, run on Pi:'
    echo '  sudo sed -i \"s/^#*xserver-command=.*/xserver-command=X -nocursor/\" /etc/lightdm/lightdm.conf'
    echo '  Or add under [Seat:*]: xserver-command=X -nocursor'
    echo '  Then: sudo reboot'
  fi
fi
" 2>/dev/null || true
echo ""
echo "=== 1. Ensure OtaClaw config (host for local display) ==="
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
cfg=~/.openclaw/canvas/otaclaw/js/config.js
if [[ -f \$cfg ]]; then
  if grep -q \"host: 'auto'\" \$cfg || grep -q 'host: \"auto\"' \$cfg; then
    echo 'Config already has host auto'
  else
    sed -i \"s/host: 'localhost'/host: 'auto'/; s/host: \\\"localhost\\\"/host: \\\"auto\\\"/\" \$cfg
    echo 'Updated host to auto'
  fi
else
  echo 'Config not found at '\$cfg
fi
"

echo ""
echo "=== 2. Create kiosk launch script ==="
REMOTE_HOME=$(ssh -o ConnectTimeout=5 "${USER}@${HOST}" "echo \$HOME" 2>/dev/null || echo "/home/${USER}")
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "mkdir -p ~/bin 2>/dev/null; cat > ~/otaclaw-kiosk.sh << 'KIOSK'
#!/bin/bash
# OtaClaw widget on connected display - 3\" screen friendly
export DISPLAY=:0
export XAUTHORITY=\${HOME}/.Xauthority 2>/dev/null
export CHROME_PASSWORD_STORE=basic
# Optional: force specific display (edit for your setup, e.g. HDMI-A-1, HDMI-A-2, DSI-1)
# xrandr --output YOUR_DISPLAY_OUTPUT --primary 2>/dev/null || true
# Low-power defaults: blank after 5 min, wake on touch/input.
xset +dpms 2>/dev/null
xset dpms 300 300 300 2>/dev/null
xset s 300 2>/dev/null
xset s blank 2>/dev/null
# Ensure screen is immediately visible after kiosk restarts.
xset dpms force on 2>/dev/null || true
# Hide cursor: unclutter hides after idle; -idle 0 = hide as soon as mouse stops
if command -v unclutter >/dev/null; then
  pkill -x unclutter 2>/dev/null || true
  unclutter -display :0 -idle 0 -root -noevents &
else
  echo "Install unclutter: sudo apt install unclutter"
fi

# Prevent desktop keyring prompts by removing password DB artifacts from kiosk profile.
PROFILE_DIR=/tmp/otaclaw-kiosk
# Recreate a clean ephemeral profile each launch to avoid keyring migration prompts.
rm -rf "\${PROFILE_DIR}" 2>/dev/null || true

# OpenClaw Gateway (2026.2.x) expects protocol-v3 auth token on connect.
# If this is the local canvas URL, append oc_token dynamically at launch time.
WIDGET_URL_RUNTIME="${WIDGET_URL}"
if [[ "\${WIDGET_URL_RUNTIME}" == http://127.0.0.1:18789/__openclaw__/canvas/* ]]; then
  OPENCLAW_TOKEN=\$(python3 -c 'import json,os; c=json.load(open(os.path.expanduser("~/.openclaw/openclaw.json"))); print(c.get("gateway",{}).get("auth",{}).get("token",""))' 2>/dev/null || echo "")
  if [[ -n "\${OPENCLAW_TOKEN}" ]]; then
    WIDGET_URL_RUNTIME="\${WIDGET_URL_RUNTIME}?oc_token=\${OPENCLAW_TOKEN}"
  fi
fi
# Cache-bust: force fresh load after each deploy/restart
[[ "\${WIDGET_URL_RUNTIME}" == *\?* ]] && WIDGET_URL_RUNTIME="\${WIDGET_URL_RUNTIME}&v=\$(date +%s)" || WIDGET_URL_RUNTIME="\${WIDGET_URL_RUNTIME}?v=\$(date +%s)"

# Wait for gateway (avoids "site can't be reached" on boot). Gateway takes ~2 min to mount canvas on cold boot.
sleep 15
for i in $(seq 1 75); do
  curl -s -o /dev/null -w '%{http_code}' "\${WIDGET_URL_RUNTIME%%\?*}" 2>/dev/null | grep -q 200 && break
  sleep 2
done

exec chromium \\
    --kiosk \\
    --enable-logging \\
    --v=1 \\
    --touch-events=enabled \\
    --app="\${WIDGET_URL_RUNTIME}" \\
    --user-data-dir=/tmp/otaclaw-kiosk \\
    --incognito \\
    --no-first-run \\
    --noerrdialogs \\
    --disable-infobars \\
    --disable-gpu \\
    --disable-smooth-scrolling \\
    --disable-background-networking \\
    --disable-component-update \\
    --disable-sync \\
    --disable-features=Translate,MediaRouter,OptimizationHints,PasswordManagerOnboarding,PasswordManager,AutofillServerCommunication \\
    --disable-session-crashed-bubble \\
    --password-store=basic \\
    --use-mock-keychain \\
    --check-for-update-interval=31536000
KIOSK
chmod +x ~/otaclaw-kiosk.sh
echo 'Created ~/otaclaw-kiosk.sh'
"

echo ""
echo "=== 3. Install systemd user service (auto-start on boot) ==="
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "mkdir -p ~/.config/systemd/user
H=\$HOME
cat > ~/.config/systemd/user/otaclaw-kiosk.service << SVCEOF
[Unit]
Description=OtaClaw Widget Kiosk
After=graphical-session.target openclaw-gateway.service
Wants=openclaw-gateway.service

[Service]
Type=simple
Environment=DISPLAY=:0
ExecStart=\${H}/otaclaw-kiosk.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
SVCEOF
echo \"Created ~/.config/systemd/user/otaclaw-kiosk.service (ExecStart=\${H}/otaclaw-kiosk.sh)\"
"

echo ""
echo "=== 4. Enable and start kiosk ==="
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
  systemctl --user daemon-reload
  systemctl --user enable otaclaw-kiosk.service
  systemctl --user restart otaclaw-kiosk.service 2>/dev/null || systemctl --user start otaclaw-kiosk.service
  sleep 2
  systemctl --user status otaclaw-kiosk.service --no-pager 2>/dev/null || echo 'Check: systemctl --user status otaclaw-kiosk'
"

echo ""
echo "=== Done ==="
echo "Widget should appear on the Pi's 3\" display."
echo ""
echo "If display is blank:"
echo "  1. Ensure Pi has desktop/GPU: ssh ${USER}@${HOST} 'echo \$DISPLAY'"
echo "  2. Test manually: ssh ${USER}@${HOST} 'DISPLAY=:0 chromium-browser --app=${WIDGET_URL} &'"
echo "  3. Logs: ssh ${USER}@${HOST} 'journalctl --user -u otaclaw-kiosk -f'"
echo ""
echo "Stop kiosk: ssh ${USER}@${HOST} 'systemctl --user stop otaclaw-kiosk'"
