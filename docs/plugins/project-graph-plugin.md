# Project Graph Plugin

The Project Graph plugin builds local code-structure metadata from explicitly
configured project roots.

## Scope

- discovers files only under an admin-supplied root
- stores structural graph metadata, not full source files
- stores graph metadata under plugin storage in the local Molenkopf data dir
- exposes graph summaries, routes, symbols, storage facts, and event facts through the generic plugin data route
- exposes scan, query, neighborhood, and delete actions through the generic plugin action route

## Descriptor v2

- category: `storage`
- risk: `orange`
- MVP actions: `scan.preview`, `scan.run`, `graph.query`, `graph.neighborhood`, `graph.delete`
- workspace data scopes: `metrics`, `project-graph`, `routes`, `symbols`

## Non-goals

- no automatic whole-machine scans
- no source-code persistence
- no Obsidian vault writes in MVP
- no MCP write tools
- no Core or Proxy runtime dependencies

## Safety

- project scanning uses explicit roots only
- denied paths and sensitive file names are excluded
- graph writes pass plugin storage safety before persistence
- plugin output still passes platform `safePluginOutput(...)`
- persisted graph data stores structural metadata and safe signatures only, not full source bodies
