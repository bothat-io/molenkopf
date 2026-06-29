# Molenkopf Debug Scopes

Molenkopf debug logging is local, opt-in, and payload-safe. It is controlled by
`MOLENKOPF_DEBUG` and writes short lines to stderr.

```bash
MOLENKOPF_DEBUG=cli,sse npm run serve:dev
```

Supported scopes:

- `pipeline`: request lifecycle, safe route/status/duration counters.
- `cli`: local CLI provider step labels, without command arguments or output.
- `sse`: SSE frame type and byte counts, without frame payload text.
- `plugins`: plugin lifecycle/event notes after plugin output sanitization.
- `usage`: usage accounting counters, provider id, request id, and token totals.
- `all` or `*`: enable every scope.

Safety rules:

- No full prompts.
- No full responses.
- No provider credentials.
- No Molenkopf API keys.
- No Authorization or Cookie values.
- No command arguments or command output.
- Long strings are redacted and bounded.

Do not use debug logs for telemetry or analytics. They are for local operator
diagnosis only.
