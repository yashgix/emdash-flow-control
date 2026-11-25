`update`, `topic-gap` and `topic-error` frames carry only the topic name. If a viewer closes a topic and a new viewer attaches to the same topic while frames for the old attachment are still in flight, the client applies those frames to the new attachment.

## Cause

The client keeps one entry per topic, and its handlers for these three frames look that entry up by topic alone (`connect.ts:136-155`). Each attachment already has an attach request id (`entry.attachId`), but the server never sends it back on these frames, so the client cannot tell which attachment a frame belongs to.

## What the tests show on `main`

| Stale frame | Effect on the reopened `ReplicaLog` |
|---|---|
| non-retrying `topic-error` | The stale frame deletes the new client entry. The log's text stays at its old value and the output that follows never arrives. |
| `update` | The text stays correct, but the sequence check triggers one extra snapshot resync. |
| `topic-gap` | The text stays correct, but `onReattach` triggers one extra snapshot resync. |

The frozen log comes from the test harness, which injects the error through the source's `onError`. In the desktop app the likely impact is the extra resync, because no log source in the current code reports a non-retrying error. This is separate from #3426, which is about input lag under background traffic.

## Proposed fix

The server stamps the attach request id as an optional `attachId` on the three frames. The client drops a stamped frame whose id is not its entry's current id. Frames without the field behave as they do today, so old and new peers still talk to each other, although an old server gets no protection. The change is 43 lines added and 8 removed in `protocol.ts`, `serve.ts` and `connect.ts`.

My branch also makes the server replace its attachment when an attach with a different id arrives for the same topic, so stamped frames always match the latest attach.

## Regression tests

14 new tests in `packages/wire/src/api/stale-topic-frames.test.ts` run the real `serve`, `connect`, `LiveLogSource` and `ReplicaLog` over an in-memory transport. Its server-to-client direction can be held and released in order, so a test can open a log, produce a frame, close and reopen the log, and then release the old frame.

With the fix the wire suite passes (367 tests). On `main` 10 of the 14 new tests fail. The other 4 are guards that pass on both, for example that a detach still reaches the server before the next attach. The tests ran against `main` at `ae7df3123`, and the three wire files are unchanged on current `main`. The test file is [`stale-topic-frames.test.ts`](https://github.com/yashgix/emdash-flow-control/blob/main/tests/stale-topic-frames.test.ts), and the fix is in [`stale-topic-frames-ae7df3123..ac95235a1.patch`](https://github.com/yashgix/emdash-flow-control/blob/main/patches/stale-topic-frames-ae7df3123..ac95235a1.patch).

## Question

Should two `Connection`s on one transport keep sharing a topic attachment? Today `serve` keeps one attachment per topic, and both connections receive its frames. Replacing the attachment, as my branch does, changes that, and a later topic-only detach from the replaced connection could remove the replacement. If sharing should stay, the server can keep its current behavior and each client can drop only the ids it abandoned itself. I am happy to write the PR either way.
