#!/usr/bin/env bash
# Quick local test: deploy and open OtaClaw (OpenClaw on this machine)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$REPO_ROOT"

echo "Deploying OtaClaw locally..."
./deploy/deploy-to-openclaw.sh --local

echo ""
echo "Open in browser:"
echo "  http://localhost:18789/__openclaw__/canvas/otaclaw/"
echo ""
echo "Widget: http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html"
echo ""
echo "Ensure OpenClaw gateway is running (port 18789)."
