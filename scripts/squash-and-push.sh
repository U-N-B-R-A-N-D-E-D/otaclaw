#!/usr/bin/env bash
#
# Squash all commits into one clean commit. Use when you've been pushing
# broken state and want a clean public history.
#
# Usage: ./scripts/squash-and-push.sh
#
set -e
cd "$(dirname "$0")/.."

echo "=== Current status ==="
git status --short
echo ""
echo "=== Recent commits ==="
git log --oneline -10
echo ""
read -p "Squash ALL into 1 commit? (will need force-push) [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Stash uncommitted changes
git add -A
git stash push -m "pre-squash" 2>/dev/null || true

# Soft reset to root (all changes become staged)
ROOT=$(git rev-list --max-parents=0 HEAD 2>/dev/null)
git reset --soft "$ROOT"

# Restore stashed changes and add everything
git stash pop 2>/dev/null || true
git add -A

# Single clean commit
git commit -m "Release 0.0.1: individual sprites only, tickle fix, docs

- Use individual sprites exclusively (no sprite sheet). setFrame and _setFrameDirect
  use sprite catalog when useIndividualFiles is true.
- Fix tickle: Hal no longer disappears. Prefer laughingSprites over sheet.
- Docs: no secrets, no Spanish, no hardcoded hostnames. YOUR_IP, YOUR_HOST.
- SECURITY.md: repo policy. README: cheerful tagline.
- CHANGELOG: 0.0.1 release, all fixes.

Have fun. No secrets. Clone and run."

echo ""
echo "=== Done. New history: ==="
git log --oneline -3
echo ""
echo "Push: git push --force-with-lease origin main"
