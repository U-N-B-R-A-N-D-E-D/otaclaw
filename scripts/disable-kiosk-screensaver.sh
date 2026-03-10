#!/usr/bin/env bash
#
# Disable screensaver (restore always-on display).
#
set -e
HOST="${1:-localhost}"
USER="${2:-admin}"

ssh -o ConnectTimeout=10 "${USER}@${HOST}" "
KIOSK=~/otaclaw-kiosk.sh
[[ -f \$KIOSK ]] || KIOSK=/home/${USER}/otaclaw-kiosk.sh
[[ ! -f \$KIOSK ]] && { echo 'Kiosk script not found'; exit 1; }

# Remove screensaver lines
sed -i.bak '
  /xset +dpms/d
  /xset dpms /d
  /xset s [0-9]/d
  /xset s blank/d
  /# Screen blank/d
  /wake on touch/d
' \"\$KIOSK\"

# Restore disable-blanking (between XAUTHORITY and unclutter)
if ! grep -q 'xset s off' \"\$KIOSK\"; then
  sed -i '/export XAUTHORITY/a\
xset s off 2>/dev/null\
xset -dpms 2>/dev/null\
xset s noblank 2>/dev/null
' \"\$KIOSK\"
fi

echo 'Restored no-blanking'
"
ssh "${USER}@${HOST}" "systemctl --user restart otaclaw-kiosk 2>/dev/null || true"
echo "Done. Screen will stay on."
