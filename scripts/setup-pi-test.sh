#!/usr/bin/env bash
#
# Setup OtaClaw on a remote host (Pi or other) for testing.
# 1. Ensure gateway binds to lan (so browser can reach it)
# 2. Deploy OtaClaw to canvas
#
# Usage: ./scripts/setup-pi-test.sh YOUR_PI_HOST [YOUR_USER]
#

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
HOST="${1:-}"
USER="${2:-pi}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 YOUR_PI_HOST [YOUR_USER]"
  exit 1
fi

echo "=== 1. Fix gateway bind (allow network access) ==="
# Gateway must bind to 'lan' (0.0.0.0) for browser/MCP on Mac to connect.
# OpenClaw valid values: loopback, lan, tailnet, auto, custom (NOT raw "0.0.0.0")
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "python3 -c \"
import json, os
p = os.path.expanduser('~/.openclaw/openclaw.json')
with open(p) as f: d = json.load(f)
g = d.get('gateway', {})
b = g.get('bind', 'loopback')
if b in ('loopback', '0.0.0.0'):
    g['bind'] = 'lan'
    d['gateway'] = g
    with open(p, 'w') as f: json.dump(d, f, indent=2)
    print('Changed bind:', repr(b), '-> lan')
else:
    print('Bind already:', repr(b))
\""

echo ""
echo "=== 2. Restart OpenClaw gateway ==="
ssh -o ConnectTimeout=10 "${USER}@${HOST}" "systemctl --user restart openclaw-gateway" || true
sleep 2

echo ""
echo "=== 3. Deploy OtaClaw to canvas ==="
cd "$REPO_ROOT"
# Use remote user's home for canvas
REMOTE_HOME=$(ssh -o ConnectTimeout=5 "${USER}@${HOST}" "echo \$HOME" 2>/dev/null || echo "/home/${USER}")
./deploy/deploy-to-openclaw.sh --host="$HOST" --user="$USER" --canvas-path="${REMOTE_HOME}/.openclaw/canvas/"

echo ""
echo "=== Done ==="
echo "Open in browser:"
echo "  http://${HOST}:18789/__openclaw__/canvas/otaclaw/"
echo ""
echo "Widget: http://${HOST}:18789/__openclaw__/canvas/otaclaw/widget.html"
echo ""
echo "Config on host: ~/.openclaw/canvas/otaclaw/js/config.js"
echo "  Set host to the IP/hostname your browser uses to reach OpenClaw"
