#!/bin/bash
# The photo reading: Claude Code, run without anyone watching, reads new drawer photos into drafts.
# Run by cron in the dev container (nas/dev/read-photos.cron): each evening, and within a minute of
# "Read new photos now" being pressed in the app. Or by hand to try it: nas/read-photos.sh
#   --if-asked   only run if the app has asked for a reading (this is what cron runs every minute)
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK="$HOME/work/photo-reading"
# The photo tool as built into the development box's image, where only root can change it
TOOL=/usr/local/bin/photo-tools
# The app's data folder. The app leaves its request here and reads how the run went, beside the project
# rather than in photos/, so the reading job (which can write in photos/) can't ask for another run.
LIVE=${BRICK_LIVE:-/live}
REQUEST="$LIVE/read-request.json"
STATUS="$LIVE/read-status.json"
ASKED=no
[ "${1:-}" = --if-asked ] && ASKED=yes

now() { date '+%F %T'; }
ms() { date +%s%3N; }
# How the run is going, for the app to show: tell_app STATE STARTED [FINISHED OK SUMMARY_FILE]
tell_app() {
  local tmp="$STATUS.tmp"
  if [ "$1" = running ]; then
    printf '{"state":"running","started":%s}\n' "$2" > "$tmp"
  elif command -v jq >/dev/null && [ -f "${5:-}" ]; then
    jq -n --argjson started "$2" --argjson finished "$3" --argjson ok "$4" --rawfile summary "$5" \
      '{state: "done", started: $started, finished: $finished, ok: $ok, summary: ($summary | .[-2000:])}' > "$tmp"
  else
    printf '{"state":"done","started":%s,"finished":%s,"ok":%s}\n' "$2" "$3" "$4" > "$tmp"
  fi
  mv "$tmp" "$STATUS"
}

if [ "$ASKED" = yes ]; then
  # Checked every minute, so say nothing unless there's something to do
  [ -e "$REQUEST" ] || exit 0
elif [ -e "$HOME/read-photos.off" ]; then
  # The pause is for the evening run. A reading asked for in the app still goes ahead.
  echo "$(now) Paused: delete ~/read-photos.off to start again."
  exit 0
fi

# One reading at a time. A request made during a run waits for the next minute after it ends, so photos
# added while it was running get read too.
mkdir -p "$WORK"
exec 9> "$HOME/work/read-photos.lock"
if ! flock -n 9; then
  [ "$ASKED" = yes ] || echo "$(now) A reading is already running."
  exit 0
fi
rm -f "$REQUEST"
started=$(ms)

fail() {
  echo "$(now) $1"
  echo "$1" > "$WORK/last-run.txt"
  tell_app done "$started" "$(ms)" false "$WORK/last-run.txt" || true
  exit 1
}
[ -d "$LIVE/photos" ] || fail "No $LIVE/photos folder: is the app's data folder mounted at $LIVE?"
[ -x "$TOOL" ] || fail "No $TOOL: rebuild the development box (nas/install.sh --dev-only in the Unraid terminal)."

echo "$(now) Reading new drawer photos$([ "$ASKED" = yes ] && echo ' (asked for in the app)')"
tell_app running "$started" || true
# Only what the job needs, so text in a photo can't talk a run into anything else:
# - it may read anything, but write only in the work folder (where it runs) and the live photos folder. Not the
#   project next to the photos, and not the repo, where it could otherwise rewrite the photo tool and then run it;
# - the only programs it may run are the image's copy of the photo tool, and ls.
# Anything else is refused rather than asked about, as nobody is there to answer.
cd "$WORK"
ok=true
claude -p "$(cat "$REPO/nas/read-photos.md")" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Glob" "Grep" "Bash($TOOL:*)" "Bash(ls:*)" \
  --add-dir "$LIVE/photos" 2>&1 | tee "$WORK/last-run.txt" || ok=false
tell_app done "$started" "$(ms)" "$ok" "$WORK/last-run.txt" || true
echo "$(now) Done$([ "$ok" = true ] || echo ', with an error')"
[ "$ok" = true ]
