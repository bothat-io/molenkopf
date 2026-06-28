# Obsidian Graph Plugin

The Obsidian Graph plugin is the local visualization workspace for derived
memory graph data.

## Scope

- reads scoped audit-derived graph data
- renders local workspace graph summaries
- exposes memory graph data through declared plugin data scopes

## Descriptor v2

- category: `visualization`
- risk: `green`
- executable actions: none in MVP
- workspace data scopes: `metrics`, `memory-graph`

## Non-goals

- no raw prompt or raw response display
- no vault write/export action in MVP
- no request-body mutation
- no provider-routing decisions

## Safety

- graph data is exposed through descriptor-scoped plugin data only
- output still passes platform `safePluginOutput(...)`
- local workspace pages must not render credentials or full prompt material
