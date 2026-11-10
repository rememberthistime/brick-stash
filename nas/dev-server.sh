#!/bin/bash
# A test copy of the app for development, on port 5174, using copies of the live data so nothing real is touched.
# Run in the development box:  nas/dev-server.sh   (Ctrl+C stops it; it starts from a fresh copy each time)
set -euo pipefail
cd "$(dirname "$0")/.."

SCRATCH=${SCRATCH:-$HOME/scratch}
mkdir -p "$SCRATCH/data" "$SCRATCH/photos"
[ -f /live/project.json ] && cp /live/project.json "$SCRATCH/data/project.json"
[ -d /live/photos ] && rsync -a --delete /live/photos/ "$SCRATCH/photos/"

# node_modules copied from Windows won't run here, so install afresh if it isn't this machine's
if [ ! -x node_modules/.bin/vite ] || [ ! -d node_modules/@esbuild/linux-x64 ]; then
  rm -rf node_modules
  npm ci
fi

if [ -n "${BRICK_TEST_HOSTS:-}" ]; then where="https://$BRICK_TEST_HOSTS"; else where="http://<NAS address>:5174"; fi
echo "Test app: $where (data copied from the live app; changes here are thrown away)"
# Vite only answers to names it's told about, so let through the one the reverse proxy uses
export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${BRICK_TEST_HOSTS:-}"
BRICK_DATA_DIR="$SCRATCH/data" BRICK_PHOTOS_DIR="$SCRATCH/photos" exec npx vite --host 0.0.0.0 --port 5174 --strictPort
