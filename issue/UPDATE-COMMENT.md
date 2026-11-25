Quick update! I've revised the fix to preserve existing topic-sharing behavior. Each connection now ignores frames from attachments it has already left (it remembers a bounded number, 32 per topic), while shared attachments continue to work as before.

I've added regression coverage for this and will include it in the PR: https://github.com/generalaction/emdash/pull/3447
