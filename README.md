<p align="center">
  <img src="packages/dashboard/public/molenkopf-logo.png" alt="Molenkopf logo" width="72">
</p>

# Molenkopf

Molenkopf is a local gateway for API and CLI based coding agents. It is not
only an OpenAI-compatible API proxy: it also supports Anthropic/Claude API
traffic and local CLI runtimes such as Claude CLI and Codex CLI. It should
reduce real transferred context, redact secrets, build local derived memory,
and write audit manifests without full prompts or responses.

Molenkopf has a fixed core safety pipeline for secret redaction, content classification, safe compression for logs, JSON and stacktraces, local retrieval storage, audit manifests, and redacted SSE events. Optional plugins extend this pipeline; core safety behavior is not toggleable.

Product intent and non-negotiable plugin semantics live in
`docs/PRODUCT_INTENT.md` and `docs/MOLENKOPF_PLUGIN_API.md`.

## Safety Notice

Do not run Molenkopf blindly with real provider accounts, private repositories,
browser sessions, or imported runtime credentials. Review `SECURITY.md` first,
keep source runs on the default loopback bind, and treat `.molenkopf/`, audit
files, retrieval stores, databases, env files, and runtime-auth profiles as
sensitive local state.

## Implemented Baseline

Built now:

- Local HTTP proxy bound to `127.0.0.1` by default.
- Transparent streaming gateway for OpenAI- and Anthropic-compatible traffic via
  base-URL interception (`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL`). Responses
  are streamed through byte-for-byte where possible (SSE, gzip, headers
  preserved); the agent runs normally and its context stream flows through
  Molenkopf.
- Transparent by default: the request body is never altered unless a transform plugin is explicitly enabled. Compression is opt-in and only reduces structured/operational content (json/log/stacktrace/shell); prose, markdown, source code, and diffs pass through untouched.
- Per-agent multi-account routing: each agent (`x-molenkopf-agent`) routes to its bound provider/account; config `profiles`/`agents` resolve to providers.
- Real token accounting: upstream `usage` is read from the provider response and recorded as
  real input/output tokens (not only a chars/4 estimate).
- Text-derived memory graph: concepts (files, symbols, error types) are extracted from the
  real redacted transferred text into a bounded co-occurrence graph.
- Static pipeline with request IDs, redaction, classification, compression, retrieval, audit, SSE events, and upstream routing.
- Local API under `/__molenkopf/*`: bootstrap endpoints for health, session
  status, and first-run admin creation, user-scoped usage/key endpoints, and admin-only
  provider/plugin/agent/stats/events/config metadata plus retention purge.
- Dashboard shell served at `/__molenkopf/dashboard` with Overview and Admin
  views backed by an isolated React/Vite dashboard package. Dedicated Providers,
  Plugins, Requests, Audit, Agents, and Settings views are planned.
- Plugin pages are local HTML surfaces under `/__molenkopf/plugins/:id/page`; context compression and memory graph pages read scoped plugin data endpoints and show explicit load errors instead of fake empty workspaces.
- The context compression plugin must expose safe token accounting for real transferred context only. Empty states must not show placeholder pressure or fake savings. Usage notes: `docs/CONTEXT_COMPRESSION_PLUGIN_README.md`.
- Practical dashboard and proxy connection guide: `docs/MOLENKOPF_USAGE.md`.
- JSON config startup target for providers, agents, and plugin policies:
  `docs/MOLENKOPF_JSON_CONFIG_PLAN.md`.
- Multi-provider env setup: `docs/MOLENKOPF_PROVIDER_ENV.md`.
- Root `/` redirects to the local dashboard; upstream API traffic stays on `/v1/...`.
- Claude/Anthropic-compatible target resolution through `ANTHROPIC_BASE_URL`; Molenkopf-owned CLI runtime bridging exists for local `claude` and `codex` child processes.
- Profile routing primitives for fixed, manual, and failover routing with env credentials, budgets, and health summaries.
- Local plugin SDK with explicit permissions and remote plugin loading disabled.
- CI mode primitives for PR context packing and audit artifacts.

Explicitly not connected:

- Remote issue-tracker integration.
- Remote plugin installation.
- Credential-file scanning or config-file credential storage. Runtime auth import
  stores credentials only when the operator explicitly imports a local profile.

## Security Model

Core and proxy use Node.js built-ins only. Molenkopf API keys are stored as hashes, imported runtime auth is kept in isolated local profile directories, and Local API responses hide provider credentials. Proxy traffic on `/v1/...` requires a valid Molenkopf API key. The default upstream route can forward incoming auth headers only when the selected profile requires it; configured provider profiles strip incoming client auth and inject the server-side credential at the forwarding boundary. Prompts and responses are not logged in full. Source code and diffs pass through in safe mode.

Before the first admin exists, only health, session status, and browser first-run
admin creation are usable. After setup, Local API metadata is role-gated: normal
users get scoped usage and key data, while provider, plugin, agent, routing,
stats, events, and retention endpoints are admin-only.

Use `--allow-public-bind` only when you intentionally want to bind outside
localhost. If Docker is published publicly before an admin exists, the first-run
screen is reachable there until the first admin is created.

## Control Plane Usage

Open `http://127.0.0.1:8787/__molenkopf/dashboard` after starting Molenkopf.
Root `/` redirects there, while upstream agent traffic still uses `/v1/...`.

Every `/v1/...` proxy request must present a valid Molenkopf API key. Use
`Authorization: Bearer mk_...` when Molenkopf supplies provider credentials. If
the client must also forward an upstream `Authorization` header, put the
Molenkopf key in `x-molenkopf-token: mk_...`; Molenkopf strips that header
before forwarding upstream.

```text
Authorization: Bearer mk_...
```

`x-molenkopf-agent` is optional local request metadata. It may select an
explicit agent binding only when that binding is already allowed for the
authenticated key, team, and provider policy; otherwise the request fails
closed.

Manual provider switching happens in the Admin provider section or by posting `{ "id": "openai-env" }` to `/__molenkopf/providers/select`. Explicit provider profiles, API-key scopes, team allowlists, and routing mode are enforced before forwarding; manual selection remains the default route when no explicit profile is attached.

Multiple provider profiles can be declared with `molenkopf.config.json` or
`MOLENKOPF_PROVIDER_IDS`. JSON profiles must reference credentials with
`auth.credentialRef` such as `env:OPENAI_API_KEY`; inline credentials are
rejected in file config. Local API responses hide credential values and show
only `credentialRef` plus configured state. Selected configured profiles inject
their credential at the forwarding boundary.

Users, teams, projects, and Molenkopf API keys are managed in the Dashboard.
Overview is the signed-in user's status, usage, teams, members, and project-key
surface. Admin contains provider, plugin, user, team, and system controls.
Projects are required key/workload labels; teams carry provider policy and usage
scope. See `docs/MOLENKOPF_USAGE.md` for the workflow and Local API endpoints.

Plugin toggles happen in the Admin plugin section or by posting `{ "id": "context-compressor-plugin", "enabled": false }` to `/__molenkopf/plugins/toggle`. Plugins are optional extensions; core safety, storage, audit, event, and routing code is not exposed as plugins and cannot be disabled through plugin controls. Remote plugin loading is disabled.

Agent drafts are stored as local proxy metadata through `/__molenkopf/agents/draft`; raw token fields are rejected and only `tokenHash` is accepted. The dashboard keeps a `localStorage` fallback if the local API is unavailable. These drafts are routing metadata, not provider credentials.

For a step-by-step local setup and test flow, read `docs/MOLENKOPF_USAGE.md`.

Plugin pages open in standalone windows from `/__molenkopf/plugins/context-compressor-plugin/page` and `/__molenkopf/plugins/obsidian-graph-plugin/page`. The graph workspace is derived from safe request metadata and redacted transferred text. Context and graph pages group by project/key where available and surface plugin-data failures explicitly.

## Commands
Install from npm with Node.js 24 or newer:

```bash
npm install -g @bothat-io/molenkopf
node -e "require('node:fs').writeFileSync('.env','MOLENKOPF_SESSION_SECRET='+require('node:crypto').randomBytes(32).toString('hex')+'\n')"
molenkopf proxy
```

Quick Docker start on the Docker host:

```bash
cp .env.example .env
# Edit .env and set a unique MOLENKOPF_SESSION_SECRET.
docker pull ghcr.io/bothat-io/molenkopf:latest
docker run --rm \
  --env-file .env \
  -p 127.0.0.1:8787:8787 \
  -v molenkopf-data:/data \
  ghcr.io/bothat-io/molenkopf:latest
```

Open `http://127.0.0.1:8787/` and create the first admin user. The Docker
quickstart binds Molenkopf to `127.0.0.1` on the host for local use; do not
publish the port publicly before admin setup and deployment security are done.
Docker requires `--env-file .env`; admin users are created only in the browser.

Use `docs/DEPLOYMENT.md` when you need a different port or non-loopback access.

For local development, use a source checkout:

```bash
npm run bootstrap
cp .env.example .env
# Edit .env and set a unique MOLENKOPF_SESSION_SECRET.
npm run dev
```

## Connect A Client

Use Molenkopf as the OpenAI-compatible base URL:

```text
http://127.0.0.1:8787/v1
```

Authenticate proxy traffic with a Molenkopf API key:

```text
Authorization: Bearer mk_...
```

If your client also sends an upstream provider credential in `Authorization`,
send the Molenkopf key separately:

```text
x-molenkopf-token: mk_...
x-molenkopf-agent: codex-local
```

These local headers are stripped before upstream forwarding. See
`docs/MOLENKOPF_USAGE.md` for a concrete `curl` request, provider setup, and
dashboard checks.

## Limitations

Provider token accounting uses upstream `usage` when present and falls back to bounded estimates for local compression pressure. JSON summaries are readable summaries, not guaranteed valid JSON. v0.1 does not retry provider failures automatically and request-side safe compression remains opt-in.

Be careful with secrets and private repositories. Molenkopf reduces accidental
exposure, but local retrieval stores still contain bounded redacted excerpts.
They do not support full-original recovery and should be treated as sensitive
local artifacts.

## License

MIT License. Copyright (c) 2026 bothat.io and Molenkopf contributors.
