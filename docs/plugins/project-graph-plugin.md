# Project Graph Plugin

The Project Graph plugin builds local code-structure metadata from explicitly
configured project roots.

## Scope

- discovers files only under an admin-supplied root
- stores structural graph metadata, not full source files
- exposes graph summaries through the generic plugin data route
- exposes scan and query actions through the generic plugin action route

## Descriptor v2

- category: `storage`
- risk: `orange`
- MVP action: `scan.preview`
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
- plugin output still passes platform `safePluginOutput(...)`
