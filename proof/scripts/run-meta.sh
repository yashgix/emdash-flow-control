#!/bin/bash
# Writes source and build hashes for one run. Usage: run-meta.sh <out.json> <tree> <traces>
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
tree="$root/work/$2"
commit=$(git -C "$tree" rev-parse HEAD 2>/dev/null || echo "pinned-copy-9e2942b8")
dirty=$(git -C "$tree" status --porcelain 2>/dev/null | grep -vc '^??' || true)
build=$(cat "$tree"/apps/workspace-server/dist/*.mjs "$tree"/packages/wire/dist/*.mjs | shasum -a 256 | cut -c1-16)
harness=$(git -C "$root/proof" rev-parse --short HEAD)
dir="$root/proof/traces"; [ "$3" != phase0 ] && dir="$dir/$3"
traces=$(cat "$dir"/*.jsonl 2>/dev/null | shasum -a 256 | cut -c1-16)  # the p29 sessions run real commands, so no trace files are needed
printf '{"tree":"%s","commit":"%s","dirtyFiles":%s,"buildSha":"%s","harness":"%s","traces":"%s","tracesSha":"%s"}\n' \
  "$2" "$commit" "$dirty" "$build" "$harness" "$3" "$traces" >"$1"
