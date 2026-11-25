#!/bin/bash
# One Emdash run on a fresh server. Usage: run-emdash.sh <name> [env assignments for the client]
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
name=$1; shift
"$here/start-server.sh"
sleep 6
[ -n "${AGENT_BYTES:-}" ] && docker exec emdash-proof-server bash -c "mkdir -p /tmp/agent-bytes && chmod 777 /tmp/agent-bytes"
docker exec -d emdash-proof-server bash -c "/work/scripts/sampler.sh >/tmp/samples.log 2>&1"
raw="$here/../results/raw"
"$here/run-meta.sh" "$raw/$name.meta.json" "${TREE:-emdash}" "${TRACES:-phase0}"
rm -f "$raw/$name.json.typing" "$raw/$name.json.typing.drop"
[ -n "${DROP_S:-}" ] && "$here/link-drop.sh" "$raw/$name.json.typing" &
docker exec "$@" ${WORKLOAD:+-e JOBS_DIR="/results/jobs/$name"} -e OUT="/results/raw/$name.json" emdash-proof-client bash -c \
  "cd /work/${TREE:-emdash}/apps/emdash-desktop && timeout 600 node /work/emdash/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.node.json harness/emdash-bench.ts"
docker logs emdash-proof-server >"$here/../results/raw/$name.server.log" 2>&1
docker cp emdash-proof-server:/tmp/samples.log "$here/../results/raw/$name.samples.log"
docker cp emdash-proof-server:/tmp/echo-s0.log "$here/../results/raw/$name.echo.log"
[ -n "${AGENT_BYTES:-}" ] && docker cp emdash-proof-server:/tmp/agent-bytes "$raw/$name.agent-bytes"
docker cp emdash-proof-server:/tmp/pacer "$here/../results/raw/$name.pacer" 2>/dev/null || true
docker cp emdash-proof-server:/tmp/emdash-flow.jsonl "$here/../results/raw/$name.flow.jsonl" 2>/dev/null || true
python3 -I "$here/../harness/analyze.py" "$here/../results/raw/$name.json" "$here/../results/raw/$name.echo.log" >"$here/../results/raw/$name.summary.json"
