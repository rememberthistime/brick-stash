# The development box on the NAS: Node, git, GitHub CLI, Claude Code and Python for reading photos, reached over SSH.
# Runs as "dev", uid 99 / gid 100 (Unraid's nobody:users), so files it writes match the app container's.
FROM node:22-bookworm

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-server cron sudo git curl ca-certificates gnupg less nano procps rsync jq \
      python3 python3-pil docker.io \
 && rm -rf /var/lib/apt/lists/*

# GitHub CLI, from GitHub's own package repository
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Docker's command-line client only, for deploying the app container through the NAS's Docker (if its socket is mounted)
ARG DOCKER_VERSION=27.3.1
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz" | tar -xz --strip-components=1 -C /usr/local/bin docker/docker

# Claude Code. Rebuild the image (nas/install.sh --dev-only) to update it.
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

# The node image's own user has uid 1000; dev takes 99:100 instead
RUN useradd --uid 99 --gid 100 --home-dir /home/dev --shell /bin/bash --no-create-home dev \
 && echo 'dev ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dev && chmod 440 /etc/sudoers.d/dev

# Key-only SSH as dev, with host keys kept outside the image so they survive a rebuild
RUN mkdir -p /run/sshd /etc/ssh/keys \
 && printf '%s\n' \
      'HostKey /etc/ssh/keys/ssh_host_ed25519_key' \
      'HostKey /etc/ssh/keys/ssh_host_rsa_key' \
      'PasswordAuthentication no' \
      'KbdInteractiveAuthentication no' \
      'PermitRootLogin no' \
      'AllowUsers dev' \
      'AcceptEnv LANG LC_*' \
      > /etc/ssh/sshd_config.d/brick-stash.conf

# Built from the nas folder (see install.sh), so the photo tool can be copied in. The evening job runs this copy,
# which belongs to root, rather than the one in the repo, which the job could otherwise rewrite and then run.
COPY dev/start.sh /usr/local/bin/start.sh
COPY dev/read-photos.cron /etc/cron.d/brick-stash
COPY photo-tools.py /usr/local/bin/photo-tools
RUN chmod 755 /usr/local/bin/start.sh /usr/local/bin/photo-tools && chmod 644 /etc/cron.d/brick-stash

EXPOSE 22 5174
CMD ["/usr/local/bin/start.sh"]
