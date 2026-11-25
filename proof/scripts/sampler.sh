#!/bin/bash
# Server-side samples every 500 ms: TCP send queue on :22, bytes waiting for sshd to read
# from unix sockets, cumulative CPU ticks of each node process (workspace server parent and workers).
while true; do
  t=$(date +%s.%N)
  tcp=$(ss -tnH state established '( sport = :22 )' | awk '{s+=$2} END {print s+0}')
  unix=$(ss -xnpH | awk '/sshd/ {s+=$3} END {print s+0}')
  cpu=$(for p in $(pgrep -f 'node /work/emdash'); do
    name=$(tr '\0' ' ' </proc/$p/cmdline | grep -o '[a-z-]*-runtime\|index.mjs' | head -1)
    rss=$(awk '/VmRSS/ {print $2}' /proc/$p/status)
    echo -n "${name:-node}:$(awk '{print $14+$15}' /proc/$p/stat):${rss:-0} "
  done)
  # Bytes the client acknowledged on :22 so far, to measure link bytes per delivered byte (phase-3 A9).
  acked=$(ss -tinH state established '( sport = :22 )' | grep -o 'bytes_acked:[0-9]*' | cut -d: -f2 | awk '{s+=$1} END {print s+0}')
  # sshd CPU ticks (all sshd processes), to show the cost of compression on the server.
  sshd=$(for p in $(pgrep -x sshd); do awk '{print $14+$15}' /proc/$p/stat; done | awk '{s+=$1} END {print s+0}')
  echo "$t $tcp $unix $cpu acked:$acked sshd:$sshd"
  sleep 0.5
done
