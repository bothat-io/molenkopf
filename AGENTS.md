# Molenkopf Contributor Rules

- Project language is English for code, docs, UI copy, issues, commits, tests,
  configuration, and release artifacts. User conversation may be German.
- Do not add dependencies to Core or Proxy.
- No telemetry.
- No analytics.
- No external runtime downloads.
- No source-code compression in safe mode.
- Do not log full prompts.
- Do not log full responses.
- Keep handwritten files below 200 lines unless the user explicitly approves an
  exception for planning documents.
- One responsibility per file.
- Add tests for new logic.
- Core and Proxy use Node built-ins only.
- Dashboard dependencies stay in the isolated dashboard package.
- Multi-account routing must use explicit profiles.
