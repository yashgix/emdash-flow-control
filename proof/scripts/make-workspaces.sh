#!/bin/bash
# Nine git workspaces: s0 is the interactive session, s1..s8 replay recorded traces.
# TRACES=heldout|heldout2|heldout3|heldout4|heldout5 use traces never used while developing the fix, with other offsets.
set -euo pipefail
case "${TRACES:-phase0}" in
  heldout)
    dir=/traces/heldout; traces=(vitest-plugins tsgo-desktop oxlint-desktop gitlog-other)
    pauses=(2000 2000 2000 60000); offset_step=1100; offset_base=300; shift_by=1 ;;
  heldout2)
    dir=/traces/heldout2; traces=(vitest-server vitest-hosts tsdown-plugins gitlog-openwork)
    pauses=(2000 2000 2000 30000); offset_step=900; offset_base=150; shift_by=2 ;;
  heldout3)
    dir=/traces/heldout3; traces=(vitest-core-runtimes oxlint-core vitest-shared-util gitlog-terse)
    pauses=(2000 2000 2000 30000); offset_step=1000; offset_base=200; shift_by=3 ;;
  heldout4)
    dir=/traces/heldout4; traces=(oxlint-openwork grep-openwork gitlog-stat-openwork-old gitlog-openwork-old)
    pauses=(2000 2000 2000 30000); offset_step=800; offset_base=250; shift_by=1 ;;
  heldout5)
    dir=/traces/heldout5; traces=(histgrep-mcpuse grep-browseruse gitlog-names-tilo gitlog-mcpuse)
    pauses=(2000 2000 2000 30000); offset_step=650; offset_base=400; shift_by=2 ;;
  *)
    dir=/traces; traces=(vitest-wire tsdown-core vitest-shared gitlog-p)
    pauses=(2000 2000 2000 15000); offset_step=700; offset_base=0; shift_by=0 ;;
esac
for i in $(seq 0 8); do
  ws=/home/dev/ws/s$i
  mkdir -p "$ws/src"
  git -C "$ws" init -q
  echo "export const n = $i;" >"$ws/src/index.ts"
  if [ "$i" -eq 0 ]; then
    echo '{"echoLog":"/tmp/echo-s0.log"}' >"$ws/.replay.json"
  else
    if [ -n "${WORKLOAD:-}" ]; then
      case "$WORKLOAD" in
        heavy) command="GOMEMLIMIT=${TSGO_MEM:-550}MiB npx --no-install tsgo --noEmit --traceResolution -p ."; cwd=/workload/${TSGO_DIR:-apps/workspace-server} ;;
        light) command='npx --no-install vitest run --maxWorkers=2 --cache=false'; cwd=/workload/packages/wire ;;
      esac
      printf '{"markEveryMs":250,"job":{"command":"%s","cwd":"%s","log":"/jobs/s%s.json","startFile":"/jobs/start"}}\n' \
        "$command" "$cwd" "$i" >"$ws/.replay.json"
      continue
    fi
    k=$(( (i - 1 + shift_by) % 4 ))
    printf '{"trace":"%s/%s.jsonl","pauseMs":%s,"offsetMs":%s,"spinnerHz":12.5,"markEveryMs":250,"speed":%s}\n' \
      "$dir" "${traces[$k]}" "${pauses[$k]}" $(( offset_base + i * offset_step )) "${SPEED:-1}" >"$ws/.replay.json"
  fi
done
chown -R dev:dev /home/dev/ws
