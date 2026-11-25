# Pinned revisions

| What | Revision |
|---|---|
| Upstream baseline used by the benchmark | `generalaction/emdash` `9e2942b8281b17703c0e66845080a556ae262677` |
| Modified code, squashed | commit `3ee503b7ad5aa2078055ac3316fe99e8305ee945` (`3ee503b7a`) on `9e2942b8`, branch `flow-control`. Tree `b8ea0a079e628887d9f3606a3843fe245b004f22`, identical to the tree of the private 40-commit development commit `7680c56806e05e9cda4629c36a4b2cd84d9be5d0` |
| Upstream `main` when the protocol issue was written | `ae7df31237e3d615a357469800ff6d158dfd11cd` (wire files unchanged on `c8769892f`) |
| Protocol test branch | `stale-topic-frames`, head `ac95235a1d52fe437259ed2d0e4dc09022bc76ec` |
| Harness build used in the counted runs | build `40bcd40b5795d5ca`, traces `bdb9f51a06681755` |
| Docker base image | `node:24.14.0-bookworm` (digest in `proof/docker/Dockerfile`) |

The modified code is also provided as `patches/flow-control-squashed.patch` (one commit on `9e2942b82`) and `patches/flow-control.bundle`.
