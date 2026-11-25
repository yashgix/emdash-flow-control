Two representative recorded terminal traces from the benchmark, `vitest-wire.jsonl` (a test run) and `tsdown-core.jsonl` (a build).
Each line is `{"t": milliseconds since start, "d": base64 of the bytes written to the terminal}`. They were scanned for paths, emails
and keys and contain only output from running tests and builds on the public Emdash source. The full trace set is private.
