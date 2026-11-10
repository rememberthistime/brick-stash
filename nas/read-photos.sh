#!/bin/bash
# The evening photo reading: Claude Code, run without anyone watching, reads new drawer photos into drafts.
# Run by cron in the dev container (nas/dev/read-photos.cron), or by hand to try it: nas/read-photos.sh
set -euo pipefail

export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."

if [ -e "$HOME/read-photos.off" ]; then
  echo "$(date '+%F %T') Paused: delete ~/read-photos.off to start again."
  exit 0
fi
if [ ! -d /live/photos ]; then
  echo "$(date '+%F %T') No /live/photos folder: is the app's data folder mounted at /live?"
  exit 1
fi

mkdir -p "$HOME/work/photo-reading"
echo "$(date '+%F %T') Reading new drawer photos"
# Only what the job needs: reading and writing files, and Python for cropping photos and fetching reference pictures.
# Anything else is refused rather than asked about, as nobody is there to answer.
claude -p "$(cat nas/read-photos.md)" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Write" "Edit" "Glob" "Grep" "Bash(python3:*)" "Bash(ls:*)" "Bash(cp:*)" "Bash(mkdir:*)" \
  --add-dir /live "$HOME/work/photo-reading"
echo "$(date '+%F %T') Done"
