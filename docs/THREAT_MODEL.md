# Molenkopf Threat Model

Date: 2026-06-23

This model describes the public Molenkopf product target and calls out
unfinished hardening explicitly.

## Assets

- Upstream provider credentials.
- Molenkopf employee and agent tokens.
- Raw prompts and raw responses.
- Retrieval originals and derived summaries.
- Audit manifests and token accounting.
- Provider selection, plugin toggles, and memory export controls.

## Attackers

- Local untrusted process on the same machine.
- Malicious local webpage that can reach loopback endpoints.
- Another employee on the LAN if public bind is enabled.
- Compromised plugin or dashboard payload.
- Over-privileged internal agent token.
- Accidental operator mistake, such as sending secrets in query strings.

## Boundaries

```text
employee client
  -> Molenkopf auth boundary
  -> policy and plugin boundary
  -> provider credential boundary
  -> upstream provider
```

```text
safe transferred text
  -> redaction
  -> compression
  -> retrieval or memory store
  -> audit/dashboard/exports
```

## Hardened Release Invariants

These are target invariants for the team gateway. Remaining hardening work is
tracked through the roadmap, GitHub issues, and release PRs.

- No provider credential values in audit, dashboard, events, docs, or plugin data.
- No full prompt or full response in audit, dashboard, events, or plugin pages.
- Query strings are stripped or redacted before audit persistence.
- First-run open mode exposes only health, current-session status, and
  first-run admin creation.
- `__molenkopf/*` control APIs require auth after setup; provider, plugin,
  routing, agent, stats, event, config metadata, and retention endpoints are
  admin-only.
- `/v1/*` proxy traffic requires a valid Molenkopf API key.
- Non-loopback source binds require an explicit `--allow-public-bind` opt-in.
- Molenkopf tokens are stored as hashes and shown once.
- Retrieval writes happen only after a real compression artifact is committed.
- Obsidian writes require dry-run and path guards before apply.
- Multi-account routing uses explicit provider profiles only.

## Implemented Plugin And Core Safety Invariants

- Plugins are optional extensions; core safety, audit, event, storage, and
  routing code is not exposed as a plugin and is not user-toggleable.
- Plugin descriptors declare type, read scopes, mutation scopes, toggle policy,
  and workspace data scopes.
- The request pipeline restores unauthorized body, route, and block mutations
  and fails closed with `plugin_capability_violation`.
- Remote plugin loading is disabled.
- Core redaction runs before optional plugin middleware.

## Storage Policy

- Audit manifests are metadata-only. Manual purge exists; retention policy,
  quotas, pagination, and project scope are planned.
- Retrieval originals are local sensitive artifacts. Manual purge exists;
  retention policy, quotas, and project scope are planned.
- Memory currently stores a bounded in-memory derived graph. Persistent memory,
  source refs, and retention policy are planned.
- Dashboard state must not persist raw tokens.

## Required Tests

- Query secret does not appear in `/requests`, latest audit, summaries, SSE, dashboard, or plugin pages.
- Nested JSON secrets are redacted before compression and audit.
- `x-molenkopf-token` and local routing headers never reach upstream.
- Unauthenticated control APIs return `401`; insufficient scopes return `403`.
- Non-loopback bind without explicit opt-in fails at startup.
- Revoked/expired tokens cannot call `/v1/*` or control APIs.
- Retrieval no-op compression leaves no stored original.
- Obsidian apply cannot write outside the selected vault root.
