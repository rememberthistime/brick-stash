#!/bin/bash
# One-time setup on the Unraid NAS: the always-on app and the development box. Safe to run again.
# From the Unraid terminal:  bash /path/to/brick-stash/nas/install.sh [--no-docker] [--dev-only]
#   --no-docker   don't give the development box the NAS's Docker, so it can't deploy (you run nas/deploy.sh yourself)
#   --dev-only    just rebuild and restart the development box, e.g. to update Claude Code
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
LIVE=${LIVE:-/mnt/user/appdata/brick-stash}
DEV=${DEV:-/mnt/user/appdata/brick-stash-dev}
SSH_PORT=${SSH_PORT:-2222}
TEST_PORT=${TEST_PORT:-5174}
WITH_DOCKER=yes
DEV_ONLY=no
for arg in "$@"; do
  case "$arg" in
    --no-docker) WITH_DOCKER=no ;;
    --dev-only) DEV_ONLY=yes ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

command -v docker >/dev/null || { echo "Docker isn't available. Turn it on in Unraid's Settings > Docker first."; exit 1; }
[ -f "$REPO/nas/dev/Dockerfile" ] || { echo "Can't find nas/dev/Dockerfile next to this script."; exit 1; }

echo "Project folder: $REPO"
echo "App data:       $LIVE"
echo "Dev box home:   $DEV/home"
mkdir -p "$LIVE/photos" "$DEV/home" "$DEV/sshd"

# Bring over the project and photos copied from the PC, never over anything the NAS already has
if [ -f "$REPO/data/project.json" ]; then
  if [ -f "$LIVE/project.json" ]; then
    echo "Kept the project already on the NAS ($LIVE/project.json) rather than the copy from the PC."
  else
    cp -p "$REPO/data/project.json" "$LIVE/project.json"
    echo "Copied your project to $LIVE/project.json"
  fi
fi
copied=0
for f in "$REPO"/photos/*; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  case "$name" in *.backup.json) continue ;; esac
  if [ ! -e "$LIVE/photos/$name" ]; then cp -p "$f" "$LIVE/photos/$name"; copied=$((copied + 1)); fi
done
echo "Copied $copied photo files to $LIVE/photos (anything already there was left alone)."

# Everything belongs to Unraid's nobody:users, which both containers run as
chown -R 99:100 "$LIVE" "$DEV/home" "$REPO"

echo "Building the development box…"
docker build -t brick-stash-dev "$REPO/nas/dev"
docker rm -f brick-stash-dev >/dev/null 2>&1 || true
extra=()
if [ "$WITH_DOCKER" = yes ]; then extra+=(-v /var/run/docker.sock:/var/run/docker.sock); fi
docker run -d --name brick-stash-dev --restart unless-stopped --hostname brick-stash-dev \
  -p "$SSH_PORT:22" -p "$TEST_PORT:5174" \
  -e LIVE_HOST="$LIVE" \
  -v "$DEV/home:/home/dev" \
  -v "$REPO:/home/dev/brick-stash" \
  -v "$LIVE:/live" \
  -v "$DEV/sshd:/etc/ssh/keys" \
  -v /etc/localtime:/etc/localtime:ro \
  "${extra[@]}" \
  brick-stash-dev >/dev/null
echo "Development box running: ssh -p $SSH_PORT dev@<this NAS's address>"

if [ "$DEV_ONLY" = no ]; then
  LIVE_HOST="$LIVE" bash "$REPO/nas/deploy.sh" --force
fi

if [ ! -s "$DEV/home/.ssh/authorized_keys" ] && [ ! -s "$REPO/nas/authorized_keys" ]; then
  echo
  echo "No SSH key has been added yet, so nobody can sign in to the development box."
  echo "Put your PC's public key (e.g. C:\\Users\\you\\.ssh\\id_rsa.pub) in $DEV/home/.ssh/authorized_keys"
  echo "or in nas/authorized_keys, then run: docker restart brick-stash-dev"
fi
