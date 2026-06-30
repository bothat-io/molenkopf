# Token Optimizer Plugin

Token Optimizer is the reference plugin for Plugin Platform v2.

## Scope

- observes audit-backed token usage
- groups traffic into token buckets
- detects repeated context patterns
- reports budget pressure as warnings only
- emits recommendations with a human review note
- returns `unavailable` for missing cache/cost values
- reports compression status from sanitized audit fields
- shows protected source and diff pressure without treating it as savings
- explains zero-savings states such as observe-only, protected source/diff
  context, policy thresholds, and missing candidates

## Permissions

- `metadata:read`
- `audit:read:scoped`
- `settings:read`
- `policy:recommend`

## Descriptor v2

- category: `routing`
- risk: `green`
- executable actions: none in MVP
- workspace data scopes: `metrics`, `audit-summary`, `requests`

## Explicit exclusions

- no request-body mutation
- no provider-routing decisions
- no budget blocking
- no auto-apply
- no auto-rollback
- no quality canary
- no named-context auto-create

Request-body mutation belongs to `context-compressor-plugin`. Token Optimizer is
the advisor and operator control surface for compression evidence.

## Output model

Missing values use typed unavailable state, for example:

- cache metrics unavailable
- pricing unavailable
- no configured plugin budget limit

Recommendations include review fields only. They are not executable plugin
actions until a descriptor action is added.

- `kind`
- `severity`
- `summary`
- `action` review note

Compression diagnostics expose sanitized values only:

- `compressionStatus`: active transformer, observer, blocked, ineffective,
  observe-only, or no candidate
- `effectivePluginIds`: plugin ids that produced confirmed or potential
  compression evidence
- `compressorModes`: transform, observe, or off
- `zeroSavingsReasons`: reason counts without raw prompt or response content
- protected source/diff tokens: context kept out of compression savings

Provider prompt-cache counters are reported only when the provider sends them.
Local static-prefix and tool-schema fingerprints help diagnose cache readiness
but are not claimed as confirmed savings.
