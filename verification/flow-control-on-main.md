# Flow-control branch on current `main`

Branch `feat/remote-interactive-lane-and-backpressure`, commit `527d1a26a20aa85361b07b58695a1f0ff6d881cd`, tree `58f32b7a9ac0b340fc22cb8bd58402949f0c8354`, on upstream `main` `c8769892f` (draft pull request #3448). Docker `node:24.14.0-bookworm`, `pnpm install --frozen-lockfile`, 25 Nov 2026.

| Check | Result |
|---|---|
| `@emdash/wire` tests | 65 files, 474 passed (`main` alone: 353) |
| `@emdash/core` tests | 273 files, 2525 passed, 27 skipped (`main` alone: 2515) |
| desktop `src/core/services/hosts` and `ssh` tests | 40 files, 413 passed, 7 skipped |
| `oxfmt --check`, `oxlint` | clean for `packages/wire` and `packages/core` (3 existing warnings in each, none from this change) |
| `tsgo` | clean for wire, core, desktop `tsconfig.node.json`, `tsconfig.browser.json` and `scripts/release/tsconfig.json` |
| test merge with #3444 | 2 conflicting hunks: `host-runtime-connection.ts` (`probe()`) and `follower.ts` (reseed) |
| test merge with #3373 | no conflicts |

Seven files were reformatted with the tree's current `oxfmt` and one unused test variable removed, because the formatter and linter on `main` are newer than the tree the change was developed on. The internal packages were built (`pnpm -r --filter "./packages/*" run build`) before the desktop checks. The benchmarks were measured on upstream `9e2942b8` and were not rerun on this branch.

Wire-protocol fix, PR #3447, commit `37da0c09932dea521e0d19f029c2d1d41c1d559c`: `@emdash/wire` 371 tests pass, `oxlint` and `tsgo` clean, 13 of the 18 new tests fail on unchanged upstream.
