I've been working on improving terminal responsiveness under heavy background traffic and measured a significant reduction in typing latency.

**Setup.** 8 background terminals each run a real command (a type-check that prints 3.2 MB) while one key is typed every 150 ms, on a 300 ms round trip. Upstream `9e2942b8`, median of 3 runs per cell:

| Link | Version | Typing echo p95 | Time for the 8 commands | Output delivered |
|---|---|---|---|---|
| fast | Upstream | 9.0 s | 13.7 s | 100% |
| | Upstream with SSH compression | 7.2 s | 11.1 s | 100% |
| | With the change | 0.48 s | 16.4 s | 100% |
| 5 Mbit | Upstream | 11.2 s | 11.4 s | 31% |
| | Upstream with SSH compression | 7.3 s | 9.9 s | 100% |
| | With the change | 0.51 s | 13.7 s | 98% |

**What the change does.** A second channel carries keystrokes and the output of the sessions being typed into. The bulk channel's SSH window follows measured round trips. Per viewer, the server sends only while unacknowledged output stays inside an adaptive window, and when more than 256 KiB is waiting the terminal session pauses reading the PTY. A bounded outbound queue shares the writer between topics. It is about 2,300 production lines plus tests.

**Trade-offs.**
- Heavy commands finish about 20% later than on upstream, and 38 to 48% later than with SSH compression, because the terminal waits instead of racing ahead. Commands that print little are not affected.
- Output can still be dropped when a topic's backlog gets too old or too large. It skipped 0.05 MB per session on the 5 Mbit link, against 0.61 MB for upstream.
- An interrupted link did not improve (median p95 11.8 s against 2.7 s for upstream on the heavy workload).
- This covers the heavy-output case I measured. It is one machine with emulated links and no real agent or remote host, so it does not settle every case in this issue.

The numbers were measured on `9e2942b8` and not rerun on current `main`. On current `main` the patch applies with a 3-way merge, and after reformatting 7 files with the repository's current formatter the `@emdash/wire`, `@emdash/core` and desktop host tests pass.

Data, harness and a walkthrough with the architecture: https://yashgix.github.io/emdash-flow-control/ (source: https://github.com/yashgix/emdash-flow-control).

#3444 touches some of the same files (`host-runtime-connection.ts`, `follower.ts`) and complements this: it keeps a busy host connected, and this keeps typing fast on it. Would you prefer this as one PR, or split into the interactive lane and window first, with credit accounting and back-pressure after?
