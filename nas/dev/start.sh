#!/bin/bash
# Starts the development box: SSH for you and Claude sessions, cron for the evening photo reading.
set -euo pipefail

mkdir -p /etc/ssh/keys /home/dev/.ssh /home/dev/logs

# Host keys live in a mounted folder, so a rebuilt image doesn't make SSH clients warn that the host has changed
[ -f /etc/ssh/keys/ssh_host_ed25519_key ] || ssh-keygen -q -t ed25519 -N '' -f /etc/ssh/keys/ssh_host_ed25519_key
[ -f /etc/ssh/keys/ssh_host_rsa_key ] || ssh-keygen -q -t rsa -b 3072 -N '' -f /etc/ssh/keys/ssh_host_rsa_key
chmod 600 /etc/ssh/keys/*_key

# Keys allowed to sign in: anything in ~/.ssh/authorized_keys, plus nas/authorized_keys from the repo on first start
if [ ! -s /home/dev/.ssh/authorized_keys ] && [ -s /home/dev/brick-stash/nas/authorized_keys ]; then
  cp /home/dev/brick-stash/nas/authorized_keys /home/dev/.ssh/authorized_keys
fi
chown 99:100 /home/dev /home/dev/.ssh /home/dev/logs
[ -f /home/dev/.ssh/authorized_keys ] && chown 99:100 /home/dev/.ssh/authorized_keys && chmod 600 /home/dev/.ssh/authorized_keys
chmod 700 /home/dev/.ssh

# Let dev use the NAS's Docker, if its socket was mounted, by joining whatever group owns it
if [ -S /var/run/docker.sock ]; then
  gid=$(stat -c %g /var/run/docker.sock)
  getent group "$gid" >/dev/null || groupadd -g "$gid" nasdocker
  usermod -aG "$(getent group "$gid" | cut -d: -f1)" dev
fi

# Settings every SSH session gets: where things are on the NAS
cat > /etc/profile.d/brick-stash.sh <<'EOF'
export BRICK_LIVE=/live
export PATH="$HOME/.local/bin:$PATH"
EOF
echo "export LIVE_HOST=${LIVE_HOST:-/mnt/user/appdata/brick-stash}" >> /etc/profile.d/brick-stash.sh
[ -f /home/dev/.bashrc ] || printf '%s\n' '[ -f /etc/profile.d/brick-stash.sh ] && . /etc/profile.d/brick-stash.sh' > /home/dev/.bashrc
chown 99:100 /home/dev/.bashrc

cron
exec /usr/sbin/sshd -D -e
