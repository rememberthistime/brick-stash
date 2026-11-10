#!/bin/bash
# Build the app from this project folder and (re)start it on the NAS, keeping its data.
# Run it in the development box (if it was given the NAS's Docker) or in the Unraid terminal:  nas/deploy.sh
# It only deploys main with nothing uncommitted, unless you add --force.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
# The data folder as the NAS sees it, which is what Docker needs even when this runs inside the development box
LIVE_HOST=${LIVE_HOST:-/mnt/user/appdata/brick-stash}
PORT=${PORT:-5173}
FORCE=no
[ "${1:-}" = --force ] && FORCE=yes

command -v docker >/dev/null || { echo "Docker isn't available here. Run this in the Unraid terminal instead."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Can't reach the NAS's Docker. In the development box that means it was set up with --no-docker: run this in the Unraid terminal instead."; exit 1; }

version=unknown
if command -v git >/dev/null && [ -d "$REPO/.git" ]; then
  g() { git -c safe.directory="$REPO" -C "$REPO" "$@"; }
  branch=$(g rev-parse --abbrev-ref HEAD)
  if [ "$FORCE" = no ]; then
    [ "$branch" = main ] || { echo "This is branch $branch, not main. Merge it first, or run with --force to deploy it anyway."; exit 1; }
    [ -z "$(g status --porcelain)" ] || { echo "There are uncommitted changes. Commit them first, or run with --force."; exit 1; }
  fi
  version="$branch $(g describe --always --dirty)"
fi

echo "Building the app ($version)…"
docker build -t brick-stash --label "brick-stash.version=$version" "$REPO"
docker rm -f brick-stash >/dev/null 2>&1 || true
docker run -d --name brick-stash --restart unless-stopped --user 99:100 \
  -p "$PORT:5173" \
  -v "$LIVE_HOST:/data" \
  -v /etc/localtime:/etc/localtime:ro \
  brick-stash >/dev/null
sleep 2
echo "App: $(docker ps --filter name=^brick-stash$ --format '{{.Status}}'), on port $PORT"
docker logs --tail 4 brick-stash
