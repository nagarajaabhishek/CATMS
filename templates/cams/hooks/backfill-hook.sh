#!/bin/bash
# CATMS CAMS hook — keeps this machine's CAMS memory in sync with git.
# Installed by `catms setup` (and `catms init` / `catms update`) as
# post-merge, post-checkout and post-rewrite, so plain pulls, rebasing pulls
# and branch switches all re-index. Runs the backfill in the background so
# git never waits on it, and logs to tools/cams/backfill.log.

HOOK="$(basename "$0")"
# post-checkout: only branch switches ($3 = 1), not single-file checkouts.
if [ "$HOOK" = "post-checkout" ] && [ "$3" != "1" ]; then exit 0; fi
# post-rewrite: only rebases (e.g. git pull --rebase), not amends.
if [ "$HOOK" = "post-rewrite" ] && [ "$1" != "rebase" ]; then exit 0; fi

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
CAMS="$TOP/__CAMS_DIR__"
TSX="$CAMS/node_modules/.bin/tsx"
# Not set up on this machine yet (run `catms setup`) — stay out of the way.
[ -x "$TSX" ] || exit 0

LOG="$CAMS/backfill.log"
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1000000 ]; then
  tail -c 200000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

(
  # Hooks inherit git's repo env vars; the backfill's own git calls must not.
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
  cd "$CAMS" || exit 0
  echo "--- $(date '+%Y-%m-%d %H:%M:%S') $HOOK"
  "$TSX" server.ts --backfill
) >> "$LOG" 2>&1 < /dev/null &

exit 0
