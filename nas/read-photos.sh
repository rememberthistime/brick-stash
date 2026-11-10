#!/bin/bash
# The evening photo reading: Claude Code, run without anyone watching, reads new drawer photos into drafts.
# Run by cron in the dev container (nas/dev/read-photos.cron), or by hand to try it: nas/read-photos.sh
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK="$HOME/work/photo-reading"
# The photo tool as built into the development box's image, where only root can change it
TOOL=/usr/local/bin/photo-tools

if [ -e "$HOME/read-photos.off" ]; then
  echo "$(date '+%F %T') Paused: delete ~/read-photos.off to start again."
  exit 0
fi
if [ ! -d /live/photos ]; then
  echo "$(date '+%F %T') No /live/photos folder: is the app's data folder mounted at /live?"
  exit 1
fi
if [ ! -x "$TOOL" ]; then
  echo "$(date '+%F %T') No $TOOL: rebuild the development box (nas/install.sh --dev-only in the Unraid terminal)."
  exit 1
fi

mkdir -p "$WORK"
echo "$(date '+%F %T') Reading new drawer photos"
# Only what the job needs, so text in a photo can't talk a run into anything else:
# - it may read anything, but write only in the work folder (where it runs) and the live photos folder. Not the
#   project next to the photos, and not the repo, where it could otherwise rewrite the photo tool and then run it;
# - the only programs it may run are the image's copy of the photo tool, and ls.
# Anything else is refused rather than asked about, as nobody is there to answer.
cd "$WORK"
claude -p "$(cat "$REPO/nas/read-photos.md")" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Glob" "Grep" "Bash($TOOL:*)" "Bash(ls:*)" \
  --add-dir /live/photos
echo "$(date '+%F %T') Done"
