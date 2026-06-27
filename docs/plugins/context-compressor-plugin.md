# Context Compressor Plugin

The Context Compressor plugin is responsible for request-body compression.

## Scope

- reads redacted request bodies
- may rewrite the request body
- writes bounded audit metadata
- exposes local plugin data for compression summaries

## Non-goals

- no token-budget policy ownership
- no provider-routing decisions
- no cache/cost analytics surface

Those concerns belong to the Token Optimizer plugin.

## Safety

- compression runs after core redaction
- original sensitive material must not leak through plugin data
- output still passes platform `safePluginOutput(...)`
