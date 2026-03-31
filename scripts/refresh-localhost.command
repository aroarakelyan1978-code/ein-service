#!/bin/zsh
set -euo pipefail

SOURCE_DIR="/Users/davitarakelian/Desktop/ITIN/"
LIVE_DIR="/Users/davitarakelian/ITIN-live/"
PLIST="/Users/davitarakelian/Library/LaunchAgents/com.etaxids.itin-localhost.plist"

mkdir -p "$LIVE_DIR"
rsync -a --delete --exclude '.DS_Store' "$SOURCE_DIR" "$LIVE_DIR"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

open "http://localhost:3000"
