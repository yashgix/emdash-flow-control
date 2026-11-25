#!/bin/bash
# Cuts the shaped link for DROP_S seconds, DROP_AFTER_S seconds after typing starts.
set -euo pipefail
typing=$1
until [ -f "$typing" ]; do sleep 0.2; done
sleep "${DROP_AFTER_S:-15}"
netem="delay ${DELAY_MS:-300}ms limit 100000"
[ -n "${RATE:-}" ] && netem="$netem rate $RATE"
docker exec emdash-proof-server tc qdisc change dev eth0 root netem $netem loss 100%
date +%s.%N >"$typing.drop"
sleep "${DROP_S:-10}"
docker exec emdash-proof-server tc qdisc change dev eth0 root netem $netem
date +%s.%N >>"$typing.drop"
