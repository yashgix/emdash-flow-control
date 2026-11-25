#!/bin/bash
# Starts the shaped-link server container.
# Usage: TREE=emdash|emdash-fix TRACES=phase0|heldout DELAY_MS=300 RATE= SPEED=1 start-server.sh
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
docker rm -f emdash-proof-server >/dev/null 2>&1 || true
workload=()
if [ -n "${WORKLOAD:-}" ]; then
  jobs="$root/proof/results/jobs/$RUN_NAME"
  rm -rf "$jobs" && mkdir -p "$jobs" && chmod 777 "$jobs"
  workload=(-e WORKLOAD="$WORKLOAD" -e TSGO_MEM="${TSGO_MEM:-}" -e TSGO_DIR="${TSGO_DIR:-apps/workspace-server}" -v "$root/work/emdash-workload:/workload" -v "$jobs:/jobs")
fi
docker run -d --name emdash-proof-server --hostname remote --network emdash-proof-net \
  --cap-add NET_ADMIN --cpus "${SERVER_CPUS:-2}" --memory "${SERVER_MEM:-2560m}" --pids-limit "${SERVER_PIDS:-1024}" \
  -e DELAY_MS="${DELAY_MS:-300}" -e RATE="${RATE:-}" -e SPEED="${SPEED:-1}" -e TRACES="${TRACES:-phase0}" \
  -e EMDASH_PACE_WINDOW_MS="${PACE_WINDOW_MS:-}" \
  -e EMDASH_PACE_IDLE_HEADROOM="${PACE_IDLE_HEADROOM:-}" \
  -v "$root/work/${TREE:-emdash}:/work/emdash:ro" \
  -v "$root/proof/harness:/work/harness:ro" \
  -v "$root/proof/scripts:/work/scripts:ro" \
  -v "$root/proof/traces:/traces:ro" \
  -v "$root/proof/keys:/keys:ro" "${workload[@]+"${workload[@]}"}" \
  emdash-proof-remote:local /work/scripts/server-entry.sh >/dev/null
