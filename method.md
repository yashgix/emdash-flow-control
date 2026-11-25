# Method

**Question.** Back-pressure keeps typing responsive. How much useful work time does it cost on real commands?

**Versions.** Unmodified upstream at `9e2942b82`, the same with SSH compression, and the modified code (interactive lane, adaptive bulk window,
credit gate, relayed back-pressure, compression). All versions ran the same commands from one fixed source tree.

**Workloads.** Eight terminal sessions each run one real command, all started together from outside the shaped link. A ninth session receives one
typed key every 150 ms and the time to its echo is measured. Output goes through each session's terminal, so a paused terminal blocks its command.
- heavy: `tsgo --noEmit --traceResolution -p .` in `packages/wire`, a real type-check with about 3.2 MB of output per command.
- light: `vitest run --maxWorkers=2` in `packages/wire`, a real test run with about 6 KB of output per command.

**Links.** `tc netem` on the server container's `eth0` adds 300 ms of delay to the server's outgoing traffic, so the round trip is about 300 ms
(the light runs show echo p50 near 300 ms). The 5 Mbit rate cap and the cut (100% loss for 10 s, starting 8 s after typing begins) apply to the
same direction. The fast link has no cap. The server container has 5 CPUs and 6 GB. Three repeats, interleaved, each one the only job of mine on the machine.

**Metrics.** Batch completion (first start to last exit), median command time, echo p50 and p95 while the commands run, keys without an echo,
output delivered and skipped per session, and recovery after the cut. A key counts as without an echo if it was sent but not echoed within
the observation window (`keys_lost` plus `keys_never_received` in the CSV). The window ends when the commands finish, so on the cut link it can end
before the link is restored.

**Validity rules, set before the runs.** A run counts only if all 8 commands exit 0. A command still running at the 150 s cap would be reported
as censored. All 45 runs counted.

**Setup changes before any counted run.** A first attempt used a larger heavy command (`apps/workspace-server`, about 14 MB of output). Eight at
once exceeded a 1024 process limit, then the 6 GB memory limit (exit 137), even with a Go memory limit. The process limit was raised to 8192
and the heavy command moved to the smaller project. Nothing else changed.

**What overlapped.** macOS storage-management processes averaged about 1.3 CPU cores on the machine in the days around the runs, and it is not
known whether they were busy during a given run. A stuck listing process ran earlier and was stopped before the three counted repeats started.
Two earlier attempts at repeats 1 and 2 counted nothing because the setup check failed. No run was dropped or rerun because of the overlap.

**Reproduce.** `proof/` holds the harness, plans (`plan-p29-*.txt`), scripts and Docker setup. `REPRODUCE.md` lists the steps. `data/p29-runs.csv` has the
metrics of every counted run, and `scripts/aggregate.py data/p29-runs.csv` rebuilds the table. The raw per-run logs are kept privately.
