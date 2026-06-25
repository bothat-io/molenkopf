# Reachability Report

`npm run check:reachability` walks production TypeScript entry points through
relative imports and prints a deterministic source and Local API route summary.
The check fails if required runtime modules stop being reachable, if a tracked
compatibility route disappears without updating its status, or if a retained
utility is removed without updating this decision.

## Classified Surfaces

- `/__molenkopf/users` is a deprecated compatibility route for legacy user
  listing and creation. New callers should use `/__molenkopf/identity` for
  identity reads and `/__molenkopf/identity/users` for create/update.
- `packages/core/src/profiles/profile-router.ts` is retained as a covered Core
  routing utility. It is intentionally not required by the proxy production
  entry graph.
