#!/bin/bash
# OtaClaw Mac Launcher
# Delegates to start-kiosk.sh with macOS defaults
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/start-kiosk.sh" "$@"
