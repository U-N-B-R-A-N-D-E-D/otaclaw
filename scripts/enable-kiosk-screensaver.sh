#!/usr/bin/env bash
#
# Enable screensaver on OtaClaw kiosk: screen blanks after timeout, wake on touch.
# Run: ./scripts/enable-kiosk-screensaver.sh YOUR_HOST YOUR_USER
#
# Optional: install screen-wake-on-openclaw.py for wake on OpenClaw activity.
#
set -e
HOST="${1:-localhost}"
USER="${2:-admin}"
TIMEOUT="${3:-300}"

echo "=== Enabling screensaver on ${USER}@${HOST} (timeout ${TIMEOUT}s = $((TIMEOUT/60)) min) ==="

ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
# Find kiosk script
KIOSK=~/otaclaw-kiosk.sh
[[ -f \$KIOSK ]] || KIOSK=/home/${USER}/otaclaw-kiosk.sh
[[ ! -f \$KIOSK ]] && { echo 'Kiosk script not found'; exit 1; }

# Replace disable-blanking with enable-screensaver
sed -i.bak '
  /xset s off/d
  /xset -dpms/d
  /xset s noblank/d
' \"\$KIOSK\"

# Insert DPMS + screensaver after XAUTHORITY line
if ! grep -q 'xset +dpms' \"\$KIOSK\"; then
  line=\$(grep -n 'XAUTHORITY' \"\$KIOSK\" | head -1 | cut -d: -f1)
  {
    head -n \"\$line\" \"\$KIOSK\"
    echo '# Screen blank after ${TIMEOUT}s idle, wake on touch'
    echo 'xset +dpms 2>/dev/null'
    echo 'xset dpms ${TIMEOUT} ${TIMEOUT} ${TIMEOUT} 2>/dev/null'
    echo 'xset s ${TIMEOUT} 2>/dev/null'
    echo 'xset s blank 2>/dev/null'
    tail -n +\$((line+1)) \"\$KIOSK\"
  } > \"\$KIOSK.tmp\" && mv \"\$KIOSK.tmp\" \"\$KIOSK\"
fi

echo 'Updated kiosk script'
grep -E 'xset|dpms|blank' \"\$KIOSK\" || true
"

echo ""
echo "Restarting kiosk..."
ssh "${USER}@${HOST}" "systemctl --user restart otaclaw-kiosk 2>/dev/null || true"

echo ""
echo "Done. Screen will blank after $((TIMEOUT/60)) min. Touch/move to wake."
echo "To disable: run scripts/disable-kiosk-screensaver.sh ${HOST} ${USER}"
