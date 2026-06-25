# Context Compression Plugin README

This plugin shows how much context Molenkopf observed, how much was forwarded after safe transforms, and how many estimated tokens were saved by confirmed context compression. The plugin never displays full prompts, full responses, API keys, Authorization headers, or Cookie headers.

Important product rule: this page must be driven by real observed payloads only. Before a client or CLI runtime sends text through the gateway, the page should show an empty state such as `No payloads observed yet`, not nonzero `Would use` or `After compression` values.

## Start

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8787/__molenkopf/plugins/context-compressor-plugin/page
```

The same workspace opens from the dashboard Admin plugin section. Disable or re-enable it there, or post to:

```text
POST /__molenkopf/plugins/toggle
{ "id": "context-compressor-plugin", "enabled": false }
```

Core safety remains active even when the compressor plugin is off.

## Attribute Token Accounting

Use one of these optional local headers from your agent/client:

```text
x-molenkopf-user: operator
x-molenkopf-agent: codex-local
```

If neither header is present, the gateway falls back to a short SHA-256 fingerprint of `Authorization` or `x-api-key`. The raw key is not stored or displayed.

`x-molenkopf-user` takes precedence over `x-molenkopf-agent`. Both attribution headers are local-only and are stripped before the request is forwarded upstream.

## What The Page Shows

- `Payload delta`: estimated original tokens minus forwarded tokens after all safe transforms.
- `Compression saved`: estimated tokens saved by confirmed context-compression replacements only.
- `Original tokens`: estimated tokens before safe transforms.
- `Forwarded tokens`: estimated tokens after safe transforms.
- `Token funnel`: original, forwarded, and confirmed compression-saved token estimates.
- `Optimization state`: whether the compressor is disabled, idle, threshold-limited, or actively saving tokens.
- `Consumers / API keys`: buckets grouped by `x-molenkopf-user`, `x-molenkopf-agent`, API-key fingerprint, or anonymous traffic.
- `Provider savings`: how much each active provider/account has seen and saved.
- `Endpoint pressure`: which API routes create token pressure.
- `Recent grouped activity`: recent manifests grouped by consumer, provider, endpoint, and status class so repeated requests from the same client stay readable.
- `Agent to upstream token flow`: how raw token pressure becomes a smaller upstream payload.
- `Retrieval`: local originals stay behind `molenkopf://...` references; the workspace displays counts, not full originals.

## Safe Workspace Boundary

- Full prompts and full responses are not rendered.
- Authorization, Cookie, and API-key values are not rendered.
- Buckets are labels for accounting, not a login or access-control system.
- Retrieval IDs point to local storage and should still be treated as sensitive.
- Manual provider switching is global default runtime state. Explicit agent
  bindings can override it through configured or drafted agent metadata.
- `anonymous` is only an unattributed-accounting fallback. It is not a product-level agent identity and should not drive memory or graph semantics.

## API

```text
GET /__molenkopf/audit/summary
```

Returns aggregate totals and per-bucket rows:

```json
{
  "originalTokens": 960,
  "compressedTokens": 540,
  "savedTokens": 420,
  "buckets": [
    { "label": "user:operator", "originalTokens": 960, "compressedTokens": 540, "savedTokens": 420 }
  ]
}
```

## Current Limits

- Token counts are estimates based on text length.
- Buckets are safe accounting labels for this workspace. Dashboard and Local API
  authorization are enforced separately.
- API-key buckets are fingerprints only; they cannot recover the original key.
- Explicit skip-reason counters are still planned; today, zero saved tokens means no large structured payload was compressed or the compressor was disabled.
