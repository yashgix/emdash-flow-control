# Flow-control branch on current `main`

Branch `feat/remote-interactive-lane-and-backpressure`, head `28854ae87949c96355b34ac862f1581a934f2706` (tree `8798738ec0c955879942cdb4a97da833c98f11e7`), three commits on upstream `main` `c8769892f` (pull request #3448). Docker `node:24.14.0-bookworm`, `pnpm install --frozen-lockfile`, 25 Nov 2026.

| Check | Result |
|---|---|
| `@emdash/wire` tests | 65 files, 480 passed (`main` alone: 353) |
| `@emdash/core` tests | 273 files, 2525 passed, 27 skipped (`main` alone: 2515) |
| desktop `src/core/services/hosts` and `ssh` tests | 40 files, 419 passed, 7 skipped |
| `oxfmt --check`, `oxlint` | clean for `packages/wire` and `packages/core`, and `oxfmt --check` clean for the touched desktop files. The warnings that remain (3 in wire, 3 in core, 1 in desktop) are not from this change |
| `tsgo` | clean for wire, core, desktop `tsconfig.node.json` and `tsconfig.browser.json` (`scripts/release/tsconfig.json` was clean on the first commit and is unaffected by the later two) |
| test merge with #3444 | 2 conflicting hunks: `host-runtime-connection.ts` (`probe()`) and `follower.ts` (reseed) |
| test merge with #3373 | no conflicts (checked on the first commit) |

Seven files were reformatted with the tree's current `oxfmt` and one unused test variable removed in the first commit, because the formatter and linter on `main` are newer than the tree the change was developed on. The internal packages were built (`pnpm -r --filter "./packages/*" run build`) before the desktop checks. The benchmarks were measured on upstream `9e2942b8` and were not rerun on this branch.

## Review fixes (25 Nov)
Two automated review findings were reproduced with tests on the previous head (`527d1a26a`), fixed in separate commits, and verified on the final tree.
- **Credit lost for early updates** (`0c913e046`, `connect.ts`): flow updates that arrive in the same chunk as the attach result ran before the result configured the credit, so they were never counted. Tests: a same-chunk update, no double count, a burst that fills the window (3 fail before, 11 of 11 pass after in `credit-client.test.ts`). Guards that pass before and after: reset after a reconnect, an attach cancelled before its result, a peer whose result has no window.
- **Cancelled input keeps waiting** (`28854ae87949c96355b34ac862f1581a934f2706`, `interactive-lane.ts`): queued input ignored its abort signal and explicit timeout while the lane was disconnected. Tests: cancel, free the buffer slot, already aborted, expiry without replay, remaining timeout, timer and listener cleanup (6 fail before, 22 of 22 pass after in `interactive-lane.test.ts`).

Wire-protocol fix, PR #3447, commit `37da0c09932dea521e0d19f029c2d1d41c1d559c`: `@emdash/wire` 371 tests pass, `oxlint` and `tsgo` clean, 13 of the 18 new tests fail on unchanged upstream.
