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

## Authenticated Token Accounting

Proxy traffic must use a Molenkopf API key. That key owns the project, team, and
usage bucket for the request. If a client also forwards an upstream
`Authorization` header, send Molenkopf auth separately:

```text
x-molenkopf-token: mk_...
x-molenkopf-agent: codex-local
```

`x-molenkopf-agent` is optional routing metadata inside the authenticated key
policy. Local Molenkopf headers are stripped before the request is forwarded
upstream.

## What The Page Shows

- `Payload delta`: estimated original tokens minus forwarded tokens after all safe transforms.
- `Compression saved`: estimated tokens saved by confirmed context-compression replacements only.
- `Original tokens`: estimated tokens before safe transforms.
- `Forwarded tokens`: estimated tokens after all safe transforms. The API
  exposes this as `forwardedTokens`.
- `Token funnel`: original, forwarded, and confirmed compression-saved token estimates.
- `Optimization state`: whether the compressor is disabled, idle, threshold-limited, or actively saving tokens.
- `Consumers / API keys`: buckets grouped by Molenkopf key, project, team, and
  optional agent routing metadata.
- `Provider savings`: how much each active provider/account has seen and saved.
- `Endpoint pressure`: which API routes create token pressure.
- `Recent grouped activity`: recent manifests grouped by consumer, provider, endpoint, and status class so repeated requests from the same client stay readable.
- `Agent to upstream token flow`: how raw token pressure becomes a smaller upstream payload.
- `Retrieval`: bounded redacted excerpts stay behind `molenkopf://...` references; the workspace displays counts, not full content.

## Safe Workspace Boundary

- Full prompts and full responses are not rendered.
- Authorization, Cookie, and API-key values are not rendered.
- Buckets are labels for accounting, not a login or access-control system.
- Retrieval IDs point to local storage and should still be treated as sensitive.
- Manual provider switching is global default runtime state. Explicit agent
  bindings can override it through configured or drafted agent metadata.

## API

```text
GET /__molenkopf/audit/summary
```

Returns aggregate totals and per-bucket rows:

```json
{
  "originalTokens": 960,
  "forwardedTokens": 540,
  "savedTokens": 420,
  "buckets": [
    { "label": "user:operator", "originalTokens": 960, "forwardedTokens": 540, "savedTokens": 420 }
  ]
}
```

## Current Limits

- Token counts are estimates based on text length.
- Buckets are safe accounting labels for this workspace. Dashboard and Local API
  authorization are enforced separately.
- API-key buckets are fingerprints only; they cannot recover the original key.
- Explicit skip-reason counters are still planned; today, zero saved tokens means no large structured payload was compressed or the compressor was disabled.
