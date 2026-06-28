# Token Optimizer Plugin

Token Optimizer is the reference plugin for Plugin Platform v2.

## MVP scope

- observes audit-backed token usage
- groups traffic into token buckets
- detects repeated context patterns
- reports budget pressure as warnings only
- emits recommendations with a human review note
- returns `unavailable` for missing cache/cost values

## MVP permissions

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
