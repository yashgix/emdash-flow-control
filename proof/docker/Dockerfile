# Pinned node:24.14.0-bookworm plus sshd, tc and tmux for the shaped-link harness.
FROM node@sha256:5a593d74b632d1c6f816457477b6819760e13624455d587eef0fa418c8d0777b
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssh-server iproute2 tmux procps \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -s /bin/bash dev \
 && mkdir -p /run/sshd
