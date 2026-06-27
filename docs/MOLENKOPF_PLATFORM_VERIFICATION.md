# Molenkopf Platform Verification

Date: 2026-06-18

Status: historical target verification plan. Use `package.json` scripts for
the current release gate.

Verification matrix for [MOLENKOPF_PLATFORM_PLAN.md](MOLENKOPF_PLATFORM_PLAN.md)
and [MOLENKOPF_PLATFORM_MILESTONES.md](MOLENKOPF_PLATFORM_MILESTONES.md).

## Matrix

- Token service: generate, verify, revoke, expire, timing-safe compare.
- Auth middleware: proxy `401`, scope `403`, local API protection, public bind.
- Provider router: per-agent routing, env credential injection, failover.
- API surface: OpenAI paths, Anthropic strategy, streaming SSE pass-through.
- Header policy: strip Molenkopf headers, inject provider credentials only at forward.
- Error contracts: network failure, invalid provider, 413, upstream 4xx/5xx.
- Compression: real savings only, skipped reasons, no abandoned retrieval files.
- Retrieval: bounded redacted excerpts, derived summaries, valid IDs, metadata persistence.
- Audit: safe manifest builder, query redaction, bounded summaries and pagination.
- Plugin runtime: descriptor uniqueness, hook gating, lifecycle events, scoped data.
- Memory: safe transfer events, semantic graph merge, bounded graph JSON.
- Obsidian: serializer, dry-run, guarded apply inside selected vault root.
- Dashboard: one live badge, wide layout, no secret strings, script parse.
- Browser smoke: desktop 1920/1440, mobile 390, tab switching, workspace launch.

## Current Local Gate

```bash
npm test
```

## Future Targeted Commands

These package gates become executable as the named owner files are implemented.

Safety metadata:

```bash
npm test
```

Plugin runtime:

```bash
npm test
```

Compression artifacts:

```bash
npm test
```

Memory and Obsidian:

```bash
npm test
```

Release gate:

```bash
npm test
```
