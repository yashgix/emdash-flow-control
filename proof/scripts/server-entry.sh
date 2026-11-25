#!/bin/bash
# Server container entry: shaped link, sshd, fake agent CLI, workspaces, Emdash workspace server.
set -euo pipefail
DELAY_MS=${DELAY_MS:-300}
RATE=${RATE:-}

ln -sf /work/harness/fake-agent.mjs /usr/local/bin/codebuff
ssh-keygen -A >/dev/null
install -d -o dev -g dev -m 700 /home/dev/.ssh
install -o dev -g dev -m 600 /keys/id_ed25519.pub /home/dev/.ssh/authorized_keys
TRACES="${TRACES:-phase0}" SPEED="${SPEED:-1}" /work/scripts/make-workspaces.sh
/usr/sbin/sshd -o MaxSessions=32 -o MaxStartups=32

netem="delay ${DELAY_MS}ms limit 100000"
[ -n "$RATE" ] && netem="$netem rate $RATE"
tc qdisc add dev eth0 root netem $netem
tc qdisc show dev eth0

exec su dev -c "cd /home/dev && EMDASH_PACE_WINDOW_MS='${EMDASH_PACE_WINDOW_MS:-}' EMDASH_PACE_IDLE_HEADROOM='${EMDASH_PACE_IDLE_HEADROOM:-}' exec node /work/emdash/apps/workspace-server/dist/index.mjs --socket /home/dev/ws.sock"
