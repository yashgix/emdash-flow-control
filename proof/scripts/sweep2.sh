#!/bin/bash
# Runs a plan: "name kind tree traces delay_ms rate speed drop_s [client -e flags...]" per line.
# kind is emdash or ssh, tree is emdash (pinned) or emdash-fix, drop_s 0 means no link cut.
set -uo pipefail
failed=0
here=$(cd "$(dirname "$0")" && pwd)
while read -r name kind tree traces delay rate speed drop rest; do
  [ -z "${name:-}" ] || [ "${name:0:1}" = "#" ] && continue
  [ -f "$here/../results/raw/$name.summary.json" ] && continue
  [ "$rate" = "-" ] && rate=""
  [ "$drop" = "0" ] && drop=""
  echo "$(date +%T) $name"
  # A client flag -e PACE_WINDOW_MS=N also sets the server's pacing window (RH10 experiments).
  pace=$(grep -o 'PACE_WINDOW_MS=[^ ]*' <<<"$rest" | cut -d= -f2 || true)
  idle=$(grep -o 'PACE_IDLE_HEADROOM=[^ ]*' <<<"$rest" | cut -d= -f2 || true)
  workload=$(grep -o 'WORKLOAD=[^ ]*' <<<"$rest" | cut -d= -f2 || true)
  rest=$(sed -E 's/-e WORKLOAD=[^ ]* ?//' <<<"$rest")
  RUN_NAME=$name WORKLOAD=$workload PACE_IDLE_HEADROOM=$idle PACE_WINDOW_MS=$pace TREE=$tree TRACES=$traces DELAY_MS=$delay RATE=$rate SPEED=$speed DROP_S=$drop \
    "$here/run-$kind.sh" "$name" $rest >/dev/null 2>&1 || { echo "  failed: $name"; failed=1; }
done <"$1"
exit $failed
