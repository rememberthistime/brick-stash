#!/bin/bash
# Build the app from this project folder and (re)start it on the NAS, keeping its data.
# Run it in the Unraid terminal (or in the development box, if it was set up --with-docker):
#   bash /mnt/user/appdata/brick-stash-dev/repo/nas/deploy.sh
# It only deploys main with nothing uncommitted, into a data folder that already has your project, unless you add --force.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
# The data folder as the NAS sees it, which is what Docker needs even when this runs inside the development box
LIVE_HOST=${LIVE_HOST:-/mnt/user/data/projects/lego}
PORT=${PORT:-5173}
WEB=${WEB:-https://lego.brindo.de}
FORCE=no
[ "${1:-}" = --force ] && FORCE=yes

command -v docker >/dev/null || { echo "Docker isn't available here. Run this in the Unraid terminal instead."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Can't reach the NAS's Docker. In the development box that means it wasn't set up --with-docker: run this in the Unraid terminal instead."; exit 1; }

# Started against an empty folder, the app would look as if your collection had gone, and a browser could then save
# its own copy over it. So a folder without a project is refused, unless this is the first install.
if [ ! -f "$LIVE_HOST/project.json" ] && [ "$FORCE" = no ]; then
  echo "There's no project at $LIVE_HOST/project.json, so this isn't the app's data folder."
  echo "Set LIVE_HOST to the right folder, or run with --force if starting with no project is what you want."
  exit 1
fi

# git may not be installed on Unraid itself, so fall back to the development box's
if command -v git >/dev/null; then
  g() { git -c safe.directory="$REPO" -C "$REPO" "$@"; }
elif docker ps --format '{{.Names}}' | grep -qx brick-stash-dev; then
  g() { docker exec -u dev brick-stash-dev git -C /home/dev/brick-stash "$@"; }
else
  g() { return 1; }
fi

version=unknown
if [ -d "$REPO/.git" ] && branch=$(g rev-parse --abbrev-ref HEAD 2>/dev/null); then
  if [ "$FORCE" = no ]; then
    [ "$branch" = main ] || { echo "This is branch $branch, not main. Merge it first, or run with --force to deploy it anyway."; exit 1; }
    [ -z "$(g status --porcelain)" ] || { echo "There are uncommitted changes. Commit them first, or run with --force."; exit 1; }
  fi
  version="$branch $(g describe --always --dirty)"
elif [ "$FORCE" = no ]; then
  echo "Can't check which version this is (no git here, and the development box isn't running). Run with --force to deploy it anyway."
  exit 1
fi

echo "Building the app ($version)…"
docker build -t brick-stash --label "brick-stash.version=$version" "$REPO"
docker rm -f brick-stash >/dev/null 2>&1 || true
docker run -d --name brick-stash --restart unless-stopped --user 99:100 \
  --label net.unraid.docker.webui="$WEB" \
  -p "$PORT:5173" \
  -v "$LIVE_HOST:/data" \
  -v /etc/localtime:/etc/localtime:ro \
  brick-stash >/dev/null
sleep 2
echo "App: $(docker ps --filter name=^brick-stash$ --format '{{.Status}}'), on port $PORT"
docker logs --tail 4 brick-stash
