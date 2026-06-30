# Plugin Policy

Molenkopf MVP uses Global + optional Team plugin policy only.

## Layers

1. Global Plugin Policy
   - required
   - default for all teams
   - upper bound for availability, capabilities, risk, actions, and settings
2. Team Plugin Policy
   - optional
   - stores overrides only
   - missing values inherit from Global
   - may only restrict Global

Key- and agent-specific plugin policy does not exist in MVP.

## Effective resolution

Effective policy is resolved as:

- Global default
- Team override, if present
- effective result

If a team has no override, the team receives the Global result unchanged.

## Restrictive merge

- enabled: `falseWins`
- max risk: lower allowed risk wins
- capabilities: intersection
- actions: intersection
- settings: per-field merge strategy

Supported merge strategies:

- `falseWins`
- `minWins`
- `maxWins`
- `orderedMax`
- `intersection`
- `inheritOnly`

## Explain view

The effective policy API exposes:

- effective enabled/disabled state
- effective max risk
- effective capabilities
- effective settings
- per-field source
- blocked reasons

Common blocked reasons:

- `team_disabled`
- `team_risk_exceeds_global`
- `team_capabilities_exceeds_global`
- `plugin_policy_invalid`

## Access

- Global policy read/write: admin
- Team policy read/write: admin
- Manager team-policy rights are deferred
- Member cannot edit policy in MVP

## Runtime surfaces

- `enabled: false` disables plugin lifecycle hooks, request hooks, and actions.
- Workspace data endpoints are read-only and are governed by effective read
  capabilities plus normal audit scoping.
- A disabled plugin can still expose historical workspace data when the caller's
  effective policy keeps the required read capability.
