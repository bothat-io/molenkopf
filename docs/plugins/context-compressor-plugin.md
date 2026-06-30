# Context Compressor Plugin

The Context Compressor plugin is responsible for request-body compression.

## Scope

- reads redacted request bodies
- may rewrite the request body
- writes bounded audit metadata
- exposes local plugin data for compression summaries
- supports descriptor-defined settings for mode, thresholds, body limits,
  candidate limits, and allowed safe content kinds

## Descriptor v2

- category: `compression`
- risk: `green`
- executable actions: none in MVP
- workspace data scopes: `metrics`, `audit-summary`, `requests`

## Non-goals

- no token-budget policy ownership
- no provider-routing decisions
- no cache/cost analytics surface

Those concerns belong to the Token Optimizer plugin.

## Safety

- compression runs after core redaction
- original sensitive material must not leak through plugin data
- output still passes platform `safePluginOutput(...)`
- source code and diffs are protected by default and reported as protected
  pressure, not potential savings
- stored retrieval excerpts are bounded, redacted, and never rendered as raw
  originals in dashboard output

Safe compression targets large operational content such as JSON, logs,
stacktraces, shell output, and fenced operational blocks. It does not compress
general prose just to show savings.
