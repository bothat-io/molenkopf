# project-graph-plugin

The project-graph-plugin derives graph metadata from token usage and scoped
audit metadata. It does not scan local source files.

## Scope

- derives route, provider, client, project, and token-count graph nodes from
  audit manifests
- stores structural graph metadata, not full source files, prompts, or responses
- stores graph metadata under plugin storage in the local Molenkopf data dir
- exposes graph summaries, routes, symbols, storage facts, and event facts through the generic plugin data route
- exposes query, neighborhood, and delete actions through the generic plugin action route

## Descriptor v2

- category: `storage`
- risk: `orange`
- MVP actions: `graph.query`, `graph.neighborhood`, `graph.delete`
- workspace data scopes: `metrics`, `project-graph`, `routes`, `symbols`

## Non-goals

- no source tree scans
- no source-code persistence
- no Obsidian vault writes in MVP
- no MCP write tools
- no Core or Proxy runtime dependencies

## Safety

- active runtime actions do not accept project root paths
- graph writes pass plugin storage safety before persistence
- plugin output still passes platform `safePluginOutput(...)`
- persisted graph data stores structural metadata only, not full source bodies,
  prompts, or responses
