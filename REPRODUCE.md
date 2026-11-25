# Reproducing the 45-run experiment

This reruns the real-command benchmark (`p29`) behind the case study: 15 runs per repeat, 3 repeats. Nothing here was rerun end to end
while packaging this repository. The scripts are the ones used for the counted runs, except that `proof/scripts/start-client.sh` mounts only the two
trees below, and `run-meta.sh` no longer requires trace files. Treat the build commands as untested on a clean machine. The expected results are in `data/p29-runs.csv`.

## Requirements
- macOS or Linux with Docker (the runs used Docker Desktop on one Mac, 8 CPUs, 10 GB for Docker), `git`, `python3`, `bash`.
- Node 24 and pnpm 10.28.2 on the host, for installing and building the trees.
- About 12 GB of disk for the trees, and about 20 minutes for one repeat. Run nothing else heavy during a repeat. The study ran
  each repeat as the only job on the machine.

## Layout
Run everything from the repository root. Create these folders next to the files already here:
```
emdash-flow-control/
  proof/{harness,scripts,docker}    already in the repository
  proof/keys/                       throwaway SSH key (step 1)
  proof/results/{raw,jobs}          output
  proof/traces/                     empty, only mounted
  work/emdash/                      pinned upstream, built
  work/emdash-epoch/                modified code, built
  work/emdash-workload/             copy of the pinned upstream with dependencies installed
```
The tree names matter, because the plans refer to them. `emdash` is the unmodified arm and `emdash-epoch` is the modified arm.

## Steps
1. Test key, folders, image and network.
```bash
mkdir -p proof/keys proof/results/raw proof/results/jobs proof/traces work
ssh-keygen -t ed25519 -N '' -f proof/keys/id_ed25519
docker build -t emdash-proof-remote:local proof/docker
docker network create emdash-proof-net
```
2. Unmodified arm, pinned upstream.
```bash
git clone https://github.com/generalaction/emdash.git work/emdash
git -C work/emdash checkout 9e2942b8281b17703c0e66845080a556ae262677
```
3. Modified arm: the same upstream commit plus the squashed commit. Either apply the patch or fetch the bundle.
```bash
git clone https://github.com/generalaction/emdash.git work/emdash-epoch
git -C work/emdash-epoch checkout 9e2942b8281b17703c0e66845080a556ae262677
git -C work/emdash-epoch am "$PWD/patches/flow-control-squashed.patch"
# check: the tree must be b8ea0a079e628887d9f3606a3843fe245b004f22
git -C work/emdash-epoch rev-parse HEAD^{tree}
```
4. Install and build both trees (commands from the repository's `package.json` files, run for the packages the server needs).
```bash
for t in emdash emdash-epoch; do
  (cd work/$t && pnpm install --frozen-lockfile \
    && pnpm exec nx run-many -t build -p @emdash/wire @emdash/core @emdash/workspace-server)
done
```
Check that `work/<tree>/apps/workspace-server/dist/index.mjs` and `work/<tree>/packages/wire/dist/rpc.mjs` exist. The counted runs used build
hash `40bcd40b5795d5ca` for the modified arm, which a rebuild may not reproduce byte for byte.
5. Workload tree. The eight sessions run real commands in a copy of the pinned upstream (with `node_modules`).
```bash
cp -R work/emdash work/emdash-workload
```
6. Run one repeat. This starts a fresh server container per run and writes `proof/results/raw/` and `proof/results/jobs/`.
```bash
bash proof/scripts/start-client.sh
TSGO_DIR=packages/wire TSGO_MEM=550 DROP_AFTER_S=8 SERVER_CPUS=5 SERVER_MEM=6g SERVER_PIDS=8192 \
  bash proof/scripts/sweep2.sh proof/scripts/plan-p29-r1.txt
```
Repeat with `plan-p29-r2.txt` and `plan-p29-r3.txt`. `plan-p29-smoke.txt` is a short check with one run per cell. A plan skips runs whose
`summary.json` already exists, and `sweep2.sh` exits nonzero if any planned run fails. `TSGO_DIR` and `TSGO_MEM` set the heavy command: a type-check in `packages/wire` with a 550 MiB Go memory limit,
chosen because eight parallel type-checks of the larger project ran out of memory on the 6 GB server container.
7. Aggregate. `scripts/export_runs.py` reads the raw results and writes the CSV, then `aggregate.py` builds the table.
```bash
python3 scripts/export_runs.py proof/results data/my-runs.csv
python3 scripts/aggregate.py data/my-runs.csv > data/my-table.md
```
To check the tables without rerunning anything: `python3 scripts/aggregate.py data/p29-runs.csv` reproduces `data/p29-table.md`.

## What each run does
`run-emdash.sh` starts the server container (`start-server.sh`, shaped link with `tc netem`), starts the sampler, and runs
`proof/harness/emdash-bench.ts` in the client container. The harness connects over SSH with the tree's own code, opens 8 background sessions that run the
workload command (started by a file written when typing begins), and types one key every 150 ms into a ninth session while measuring the echo.
`analyze.py` writes `summary.json`. The link cut (`link-drop.sh`) starts 8 s after typing begins and lasts 10 s.

## Known limits of this guide
Not verified from a clean machine: the build commands, the Docker network creation, and the `am` step. Whether the results reproduce, and whether the
relative performance holds on other hardware, has not been verified. All 45 counted runs came from one machine.
