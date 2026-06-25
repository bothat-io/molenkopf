# Molenkopf Admin Distribution

Date: 2026-06-18

This document describes the target admin workflow for distributing Molenkopf to
employees and local agents without exposing upstream provider credentials.

## Admin Flow

```text
admin
  -> add provider profile
  -> bind credential reference
  -> create employee or agent token
  -> assign provider and plugin policy
  -> give setup snippet to employee
  -> monitor, rotate, revoke
```

## Provider Setup

Provider profiles store configuration and credential references only.

```text
id: openai-prod
kind: openai-compatible
target: https://api.openai.com/v1
credentialRef: env:OPENAI_API_KEY
allowedModels: gpt-5.5, gpt-5.4
```

Rules:

- Never store provider credential values in Molenkopf config or dashboard state.
- Validate target URLs and env-key names.
- Disabled providers can stay listed but must not route traffic.
- Provider health, last error, and failover state are visible as redacted metadata.

## Employee Token Setup

Target token lifecycle:

```text
create
  -> raw mk_ token shown once
  -> sha256 hash stored
  -> scopes and provider profile assigned
  -> lastUsedAt updated on valid use
  -> revoke or rotate when needed
```

Default scopes for a normal employee:

```text
proxy:use
control:read
audit:read:self
memory:read:self
```

Admin scopes are separate and should be rare:

```text
agents:manage
providers:manage
providers:select
plugins:toggle
audit:read:all
obsidian:apply
```

## Setup Snippet

Target snippet for OpenAI-compatible clients:

```text
OPENAI_BASE_URL=http://molenkopf.example/v1
OPENAI_API_KEY=replace-with-molenkopf-token
```

The `OPENAI_API_KEY` value is an Molenkopf token here. Molenkopf authenticates it
and then applies the assigned provider policy. It is not an upstream provider
key.

Optional local identity headers can remain for display/accounting, but auth must
come from the Molenkopf token:

```text
x-molenkopf-user: employee-id
x-molenkopf-agent: codex-local
```

## Rotate And Revoke

- Rotate creates a new raw token and stores a new hash.
- The old token stops working immediately after rotation.
- Revoke keeps historical audit identity but blocks future use.
- Token list responses show labels, scopes, timestamps, and fingerprints only.
- Raw tokens are never returned after creation or rotation.

## Diagnostics

Employee and agent detail views should show:

- last seen
- assigned provider profile
- request count
- error count
- saved tokens
- warnings
- last request timestamp
- active plugin policy

They must not show:

- full prompt
- full response
- provider key
- Molenkopf raw token
- cookie or authorization header
