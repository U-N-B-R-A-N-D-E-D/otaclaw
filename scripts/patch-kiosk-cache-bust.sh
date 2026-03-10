#!/usr/bin/env bash
set -e
# Patch existing otaclaw-kiosk.sh on Pi to add cache-busting (force fresh load after deploy).
# Usage: ./scripts/patch-kiosk-cache-bust.sh [HOST] [USER]
# Or run via deploy: ./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --restart-kiosk

HOST="${1:-localhost}"
USER="${2:-admin}"
K="$HOME/otaclaw-kiosk.sh"

ssh -o ConnectTimeout=5 "${USER}@${HOST}" "bash -s" << 'PATCH'
K=~/otaclaw-kiosk.sh
if [[ ! -f "$K" ]]; then
  echo "Kiosk script not found at $K"
  exit 0
fi
# Ensure --touch-events=enabled and --touch-devices for Pi resistive touch (LCD Wiki 3.5", XPT2046/ADS7846)
python3 - "$K" << 'PYTOUCH'
import sys, re
k = sys.argv[1]
with open(k, 'r') as f:
    content = f.read()
changed = False
# Add --touch-events=enabled after --kiosk (Chromium ignores touch on Linux without touch flags)
if '--touch-events=enabled' not in content and '--kiosk' in content:
    content = re.sub(r'(\-\-kiosk\s+)\\\s*\n', r'\1\\\n    --touch-events=enabled \\\n', content, count=1)
    changed = True
# Add Chromium logging for freeze/debug (JS errors, WebSocket, etc.)
if '--enable-logging' not in content and 'exec chromium' in content:
    content = re.sub(r'(\-\-kiosk\s+)\\\s*\n', r'\1\\\n    --enable-logging \\\n    --v=1 \\\n', content, count=1)
    changed = True
# Inject touch device detection and --touch-devices (Chromium needs device ID for resistive)
if 'touch-devices' not in content and 'exec chromium' in content:
    inject = '''
# Resistive touch (XPT2046/ADS7846): Chromium ignores touch without --touch-devices
TOUCH_DEVICES=""
if command -v xinput &>/dev/null; then
  TOUCH_DEVICES=$(DISPLAY=:0 xinput list 2>/dev/null | grep -iE 'ADS7846|Touchscreen|XPT2046|FT5406' | sed -n 's/.*id=\\([0-9][0-9]*\\).*/\\1/p' | head -1)
fi

'''
    content = content.replace('exec chromium', inject + 'exec chromium', 1)
    changed = True
# Add --touch-devices=$TOUCH_DEVICES after --touch-events=enabled
if '--touch-devices=' not in content and '--touch-events=enabled' in content:
    content = re.sub(
        r'(\-\-touch-events=enabled\s+)\\\s*\n',
        r'\1\\\n    ${TOUCH_DEVICES:+--touch-devices=$TOUCH_DEVICES} \\\n',
        content, count=1
    )
    changed = True
if changed:
    with open(k, 'w') as f:
        f.write(content)
    print('Added touch support (--touch-events, --touch-devices)')
PYTOUCH
# Ensure --incognito is present (without it Chromium may show Google default instead of widget)
if ! grep -q '\-\-incognito' "$K"; then
  python3 -c "
import sys
with open(sys.argv[1], 'r') as f:
    content = f.read()
if '--incognito' not in content and '--user-data-dir=/tmp/otaclaw-kiosk' in content:
    content = content.replace('--user-data-dir=/tmp/otaclaw-kiosk \\\\', '--user-data-dir=/tmp/otaclaw-kiosk \\\\\n    --incognito \\\\')
    with open(sys.argv[1], 'w') as f:
        f.write(content)
    print('Restored --incognito')
" "$K" 2>/dev/null || true
fi

# Fix broken cache-bust and add rotation=270 for kiosk (portrait)
python3 - "$K" << 'PYEOF'
import sys, re
k = sys.argv[1]
with open(k, 'r') as f:
    content = f.read()
# Add rotation=270 for kiosk (portrait). Tab without param gets 0.
if 'rotation=270' not in content:
    content = re.sub(
        r'(oc_token=\$\{OPENCLAW_TOKEN\})"',
        r'\1&rotation=270"',
        content, count=1
    )
correct = '[[ "${WIDGET_URL_RUNTIME}" == *\\?* ]] && WIDGET_URL_RUNTIME="${WIDGET_URL_RUNTIME}&v=$(date +%s)" || WIDGET_URL_RUNTIME="${WIDGET_URL_RUNTIME}?v=$(date +%s)"'
content = re.sub(r'\[\[ "" == \*\\\?\* \]\].*', correct, content)
content = re.sub(r'WIDGET_URL_RUNTIME="[?&]v=\d+"', correct, content)
if 'Cache-bust' not in content:
    content = content.replace('exec chromium', '# Cache-bust: force fresh load after each deploy/restart\n' + correct + '\n\nexec chromium', 1)
with open(k, 'w') as f:
    f.write(content)
print("Fixed cache-bust")
PYEOF
PATCH
