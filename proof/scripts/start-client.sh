#!/bin/bash
# Starts the idle client container. Harness runs go through docker exec (see run-emdash.sh).
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
docker rm -f emdash-proof-client >/dev/null 2>&1 || true
docker run -d --name emdash-proof-client --network emdash-proof-net \
  --cpus "${CLIENT_CPUS:-1.5}" --memory 1536m --pids-limit 1024 \
  -v "$root/work/emdash:/work/emdash:ro" \
  -v "$root/proof/harness:/work/emdash/apps/emdash-desktop/harness:ro" \
  -v "$root/work/emdash-epoch:/work/emdash-epoch:ro" \
  -v "$root/proof/harness:/work/emdash-epoch/apps/emdash-desktop/harness:ro" \
  -v "$root/proof/keys:/keys:ro" \
  -v "$root/proof/results:/results" \
  emdash-proof-remote:local sleep infinity >/dev/null
docker exec emdash-proof-client bash -c 'install -d -m 700 /root/.ssh && cp /keys/id_ed25519 /root/.ssh/ && chmod 600 /root/.ssh/id_ed25519 && printf "Host remote\n  User dev\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n  LogLevel ERROR\n" >/root/.ssh/config'
