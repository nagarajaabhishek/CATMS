#!/bin/bash
# CATMS watch-sync — optional continuous git pull + CAMS backfill
#
# Purpose: keep project memory fresh between developers by polling for new changes
# and re-indexing the semantic memory every 5 minutes (or custom interval).
#
# Usage (run in a spare terminal/tmux pane):
#   ./tools/cams/watch-sync.sh          # 5-minute poll interval (default)
#   ./tools/cams/watch-sync.sh 300      # 300 seconds (same)
#   ./tools/cams/watch-sync.sh 60       # 60 seconds (more frequent, higher CPU/network)
#
# Stop with Ctrl+C.
#
# Why this exists: without this, memory freshness is bounded by when developers
# manually git pull. For a multi-developer team, that can be hours apart.
# This script bridges the gap with automatic, low-overhead polling.

set -e

INTERVAL="${1:-300}"  # Default 5 minutes, configurable in seconds

if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 [interval-in-seconds]"
  echo "Default interval: 300 seconds (5 minutes)"
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "watch-sync started — polling every ${INTERVAL} seconds"
echo "Press Ctrl+C to stop"
echo ""

trap "echo 'Stopped.' && exit 0" SIGINT

while true; do
  git pull --quiet || true  # Silent failure if network is down
  sleep "$INTERVAL"
done
