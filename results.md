# Results

Median of 3 runs per cell. Ranges are in `table.md` and every run is in `data/p29-runs.csv`.

| Workload and link | Version | Time to finish | Echo p95 | Output delivered, of 3.25 MB |
|---|---|---|---|---|
| heavy, fast | upstream | 13.7 s | 9.0 s | 3.25 MB |
| | upstream with compression | 11.1 s | 7.2 s | 3.25 |
| | modified | 16.4 s | 0.48 s | 3.25 |
| heavy, 5 Mbit | upstream | 11.4 s | 11.2 s | 1.0 (31%) |
| | upstream with compression | 9.9 s | 7.3 s | 3.25 (100%) |
| | modified | 13.7 s | 0.51 s | 3.2 (98%) |
| heavy, 10 s cut | upstream | 10.3 s | 2.7 s | 2.1 |
| | upstream with compression | 10.9 s | 2.8 s | 2.5 |
| | modified | 14.0 s | 11.8 s | 3.25 |
| light, fast | upstream, modified | 27.7 s, 28.3 s | 0.34 s, 0.34 s | all |

- **Typing.** The modified code has 19× lower p95 echo latency on the fast link (0.48 s against 9.0 s) and keeps p95 near 0.5 s on the 5 Mbit link,
  against 11.2 s for upstream and 7.3 s with compression.
- **Completion time.** Heavy commands finish about 20% later than on unmodified upstream, on both the fast link (16.4 s against 13.7 s) and the 5 Mbit
  link (13.7 s against 11.4 s). Against upstream with compression the cost is 48% and 38%. The ranges overlap with upstream (fast link: upstream
  12.8 to 18.9 s, modified 13.5 to 16.9 s), so with 3 runs this is a modest cost with some noise.
- **Output.** On the 5 Mbit link unmodified upstream delivered 31% of the output, upstream with compression 100%, and the modified code 98%.
  The modified code can still drop output: it skipped 0.05 MB per session there, against 0.61 MB for upstream.
- **Keys without an echo, sum of 3 runs.** Fast link: 28 for upstream, 8 with compression, 0 modified. 5 Mbit: 8, 0, 0. Cut link: 164, 177, 44, with the 44 from one run.
- **Light commands.** No measurable slowdown, about 28 s in every version.
- **Interrupted link.** No improvement. Echo p95 was 11.8 s for the modified code against 2.7 s for upstream on the heavy workload. In two of the three
  modified runs the p95 was about 12 s. Counts on the cut link include keys still waiting when the commands ended. On the light workload the cut gave a p95 of 19.2 s for the modified code and 21.8 s for upstream, with 0 and 134 keys without an echo. Recovery time could be measured in
  only one run, so it is not reported.

## Limits
- Heavy output was 3.2 MB, less than a large build. The typing window on heavy runs is short, about 70 keys.
- Three repeats, one machine, emulated links and one fixed source tree.
- Background activity on the machine overlapped the runs (see `method.md`).
- No real coding agent and no real remote host were used.
- Reproducing the results on a clean machine, and the relative performance on other hardware, are not verified.
