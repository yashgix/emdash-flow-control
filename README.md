# emdash-flow-control

Case study: [yashgix.github.io/emdash-flow-control](https://yashgix.github.io/emdash-flow-control/) · Wire-protocol fix: [generalaction/emdash#3447](https://github.com/generalaction/emdash/pull/3447) (issue [#3446](https://github.com/generalaction/emdash/issues/3446)) · Flow control: draft [generalaction/emdash#3448](https://github.com/generalaction/emdash/pull/3448) (issue [#3426](https://github.com/generalaction/emdash/issues/3426))

Keeping typing responsive in a busy remote terminal in [Emdash](https://github.com/generalaction/emdash), a desktop app that runs coding agents on remote machines over SSH. Open `index.html` for the case study, with an interactive comparison of the versions and a walkthrough of a separate wire-protocol fix.

## The problem
Emdash sends the output of every terminal over one SSH connection. When several terminals print a lot, the echo of a key you type queues behind output you are not looking at. On a slow link the p95 echo latency was 9 to 11 seconds. Upstream [issue #3426](https://github.com/generalaction/emdash/issues/3426) describes the same symptom on a high-latency host.

## Results
Eight background terminals each ran a real command (a type-check printing 3.2 MB per terminal) while one key was typed every 150 ms. Median of 3 runs, 300 ms round trip, upstream at `9e2942b8`.

| Link | Version | Time for the 8 commands | Typing echo p95 | Output delivered, of 3.25 MB |
|---|---|---|---|---|
| Fast | Upstream | 13.7 s | 9.0 s | 3.25 MB |
| | Upstream with SSH compression | 11.1 s | 7.2 s | 3.25 MB |
| | **Modified** | 16.4 s | **0.48 s** | 3.25 MB |
| 5 Mbit | Upstream | 11.4 s | 11.2 s | 1.0 MB (31%) |
| | Upstream with SSH compression | 9.9 s | 7.3 s | 3.25 MB (100%) |
| | **Modified** | 13.7 s | **0.51 s** | 3.2 MB (98%) |
| 10 s cut | Upstream | 10.3 s | 2.7 s | 2.1 MB |
| | Upstream with SSH compression | 10.9 s | 2.8 s | 2.5 MB |
| | **Modified** | 14.0 s | 11.8 s | 3.25 MB |

- Typing echo p95 is 19× lower on the fast link, 0.48 s against 9.0 s.
- The cost is time. Heavy commands finish about 20% later than on unmodified upstream and 48% (fast) and 38% (5 Mbit) later than with SSH compression. Commands that print little (a test run) took about 28 s in every version.
- On the 5 Mbit link the modified code delivered 98% of the output, against 31% for upstream and 100% with compression.
- The interrupted link did not improve. On the heavy workload the median modified p95 was 11.8 s against 2.7 s for upstream. All three modified runs have a p95: two are around 12 s, because typing waited for the link to return, and one is 0.49 s.
- Keys without an echo, summed across the 3 runs: 28 (upstream), 8 (compression), 0 (modified) on the fast link and 8, 0, 0 on the 5 Mbit link. On the cut link: 164, 177 and 44.

The light workload (a test run printing about 6 KB per command, median of 3):

| Link | Upstream: time, p95, keys without an echo | Modified: time, p95, keys without an echo |
|---|---|---|
| Fast | 27.7 s, 0.34 s, 0 | 28.3 s, 0.34 s, 0 |
| 5 Mbit | 29.4 s, 0.34 s, 0 | 27.7 s, 0.34 s, 0 |
| 10 s cut | 28.7 s, 21.8 s, 134 | 28.0 s, 19.2 s, 0 |

Full table: [`table.md`](table.md). Every run: [`data/p29-runs.csv`](data/p29-runs.csv).

## Approach
- **Interactive lane.** A second Wire channel carries keystrokes, resizes and the output of up to 2 recently typed sessions, so they do not wait behind bulk updates in Emdash's own queues. Both channels still share one SSH connection.
- **Adaptive bulk window.** The SSH window of the bulk channel is tuned from measured round trips, between 512 KiB and 32 MiB.
- **Credit accounting.** For each viewer the server sends only while unacknowledged output stays inside a window. The viewer returns credit as it consumes updates.
- **Back-pressure.** When more than 256 KiB is waiting, Emdash pauses reading the terminal's PTY, and the program slows down once the kernel's PTY buffer is full.
- **Outbound queue.** Topics share the writer fairly, and a topic with a backlog older than 3 s drops it and resyncs from a snapshot, so output can still be dropped under heavy load.

The diagram and the congestion walkthrough are under Technical details in `index.html`.

## A separate contribution: stale topic frames
`update`, `topic-gap` and `topic-error` frames carry only the topic name. If a viewer closes a topic and a new viewer attaches to it while frames for the old attachment are in flight, the client applies them to the new attachment. In the tests this causes one extra snapshot resync for a stale `update` or `topic-gap`, and a log that stops updating for a stale non-retrying `topic-error`. The frozen log comes from the test harness, which injects the error through the source. In the desktop app the likely impact is the extra resync, because no log source in the current code reports a non-retrying error.

The fix stamps the attach id on the three frames and returns it in the attach result. The client remembers, per topic, the ids it has left (its own and a shared attachment's, including the late result of a cancelled attach) and drops a frame stamped with one of them (88 lines added, 9 removed). Frames from a shared attachment and frames without an id behave as before, so topic sharing and detach are unchanged. 18 regression tests run the real `serve`, `connect` and `ReplicaLog` over an in-memory transport: with the fix the wire suite passes (371 tests), and on unchanged upstream 13 of the 18 fail, with the rest passing as guards. The tests include a held frame stamped with a shared attachment's id, a shared attach cancelled before its result arrives (found in review of the pull request), and two delay boundaries, 300 other topics left and 20 reopen cycles of one topic. This is not complete stale-frame protection. A frame that arrives before the late result of a cancelled attach is not recognised. The fix remembers at most 32 ids per topic, so a frame delayed past 32 further cycles of one topic on one connection is not recognised, and at most 4096 topics per connection, after which the ids of the least recently changed topic are evicted.

The issue is [generalaction/emdash#3446](https://github.com/generalaction/emdash/issues/3446) and the fix is [pull request #3447](https://github.com/generalaction/emdash/pull/3447). The issue text and the later update are in [`issue/`](issue/), the patch in [`patches/`](patches/) and the test file in [`tests/`](tests/).

## Evidence and walkthrough
- `index.html`: the case study. Overview for a short read, Technical details for the architecture, method, results and the protocol walkthrough.
- [`method.md`](method.md), [`results.md`](results.md), [`table.md`](table.md): method, results and limits.
- [`data/p29-runs.csv`](data/p29-runs.csv): one row per counted run. `python3 scripts/aggregate.py data/p29-runs.csv` rebuilds the table.

## Reproduce
[`REPRODUCE.md`](REPRODUCE.md) lists the layout, the pinned checkouts, the patch, the build, the Docker setup and the commands for the 45-run experiment. It has not been run on a clean machine, and whether the results reproduce on other hardware is not verified.

## Upstream status
The wire-protocol issue is [#3446](https://github.com/generalaction/emdash/issues/3446) and its fix is open as [pull request #3447](https://github.com/generalaction/emdash/pull/3447). The flow-control change is open as [draft pull request #3448](https://github.com/generalaction/emdash/pull/3448) with a note on [#3426](https://github.com/generalaction/emdash/issues/3426) and an offer to split it. Nothing has been reviewed or merged yet. The flow-control change was developed and benchmarked on Emdash `9e2942b8` (`patches/flow-control-squashed.patch`, with a git bundle). The draft pull request is based on current `main` (`patches/flow-control-on-main.patch`, checks in `verification/`). Open upstream pull request [#3444](https://github.com/generalaction/emdash/pull/3444) changes some of the same files, with one conflicting hunk in each of `host-runtime-connection.ts` and `follower.ts` that I resolve when the order of merging is known. It also adds an optional `onActivity` hook to `WireTransport` in `protocol.ts`, a different part of the file from the stale-frame fix.

## Files
| Path | What |
|---|---|
| `index.html` | the case study |
| `method.md`, `results.md`, `table.md`, `REVISIONS.md`, `REPRODUCE.md` | method, results, pinned revisions, reproduction steps |
| `data/` | per-run CSV and the table built from it |
| `scripts/` | `aggregate.py`, `export_runs.py`, `table_p29_from_raw.py` (the last two need the raw logs, which are not published) |
| `proof/` | benchmark harness, scripts, plans and Docker image |
| `verification/` | test, lint and typecheck results of the flow-control branch on current `main` |
| `patches/` | flow-control patch and bundle, a copy of the flow-control patch rebased onto upstream `c8769892f` (`flow-control-on-main.patch`, apply with `git apply --3way`), and the stale-frames patch |
| `tests/` | the 18 regression tests for the stale-frames fix |
| `issue/` | title and body of the wire-protocol issue |
| `traces/` | two sample recorded traces |

## Licence
Emdash is Apache License 2.0, Copyright 2026 General Action, Inc. (`LICENSE`). The patches derive from that code and keep that licence, and the harness, scripts and text are also Apache 2.0. The page uses Inter (SIL Open Font License 1.1, The Inter Project Authors) and Commit Mono (SIL Open Font License 1.1, Eigil Nikolajsen), self-hosted from the Fontsource packages, with the licences in `fonts/`. The flow-control patch extends upstream's existing pnpm patch for `ssh2` (MIT), which stays under its own licence.

## Author
Yash Gupta · [GitHub](https://github.com/yashgix) · [LinkedIn](https://www.linkedin.com/in/yash-guptaix/)

This is an independent project and is not affiliated with Emdash or General Action, Inc.
