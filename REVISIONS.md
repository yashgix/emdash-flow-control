# Pinned revisions

| What | Revision |
|---|---|
| Upstream baseline used by the benchmark | `generalaction/emdash` `9e2942b8281b17703c0e66845080a556ae262677` |
| Modified code, squashed | commit `3ee503b7ad5aa2078055ac3316fe99e8305ee945` (`3ee503b7a`) on `9e2942b8`, branch `flow-control`. Tree `b8ea0a079e628887d9f3606a3843fe245b004f22`, identical to the tree of the private 40-commit development commit `7680c56806e05e9cda4629c36a4b2cd84d9be5d0` |
| Upstream `main` when the protocol issue was written | `ae7df31237e3d615a357469800ff6d158dfd11cd` (wire files unchanged on `c8769892f`) |
| Stale-frames fix | branch `fix/wire-ignore-stale-topic-frames` on `yashgix/emdash`, commits `65f0d06603516c50a0295c582d757f433db49439` and `37da0c09932dea521e0d19f029c2d1d41c1d559c` on `ae7df3123`, pull request #3447, as `patches/stale-frames-sharing.patch` (two commits) |
| Harness build used in the counted runs | build `40bcd40b5795d5ca`, traces `bdb9f51a06681755` |
| Docker base image | `node:24.14.0-bookworm` (digest in `proof/docker/Dockerfile`) |

The modified code is also provided as `patches/flow-control-squashed.patch` (one commit on `9e2942b82`) and `patches/flow-control.bundle`.

Flow-control pull request #3448: branch `feat/remote-interactive-lane-and-backpressure` on `yashgix/emdash`, commit `527d1a26a20aa85361b07b58695a1f0ff6d881cd` (tree `58f32b7a9ac0b340fc22cb8bd58402949f0c8354`) on upstream `main` `c8769892f`, as `patches/flow-control-on-main.patch`. It is the flow-control change with 7 files reformatted by that tree's current formatter and one unused test variable removed. Checks and results: `verification/flow-control-on-main.md`. The benchmarks were not rerun on it.
