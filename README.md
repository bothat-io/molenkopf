<p align="center">
  <img src="packages/dashboard/public/molenkopf-logo.png" alt="Molenkopf logo" width="72">
</p>

<h1 align="center">Molenkopf</h1>

<p align="center">
  <strong>Local control plane for coding-agent traffic.</strong>
</p>

Molenkopf sits between coding agents and provider or runtime backends. It proxies
OpenAI-compatible and Anthropic/Claude API traffic, can bridge local Claude CLI
and Codex CLI runtimes, and gives teams local keys, routing, usage, budgets,
redaction, audit manifests, and dashboard controls.

The core safety pipeline is fixed: secret redaction, content classification,
safe compression for structured operational text, local retrieval storage,
audit manifests, and redacted SSE events are always owned by Molenkopf.
Optional plugins extend the pipeline; they do not replace core safety behavior.

Product intent and non-negotiable plugin semantics live in
`docs/PRODUCT_INTENT.md` and `docs/MOLENKOPF_PLUGIN_API.md`.

## Quickstart

1. Install with Node.js 24 or newer, create a session secret, and start the
   local proxy:

```bash
npm install -g @bothat-io/molenkopf
node -e "require('node:fs').writeFileSync('.env','MOLENKOPF_SESSION_SECRET='+require('node:crypto').randomBytes(32).toString('hex')+'\n')"
molenkopf proxy
```

2. Open `http://127.0.0.1:8787/`, create the first admin user, configure a
   provider or imported runtime, and create a Molenkopf API key.

3. Point an OpenAI-compatible client at Molenkopf:

```text
Base URL: http://127.0.0.1:8787/v1
Authorization: Bearer mk_...
```

4. Or connect a local CLI runtime:

```powershell
$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:8787'
$env:ANTHROPIC_API_KEY = '<molenkopf-api-key>'
claude
```

Connect Codex CLI through the OpenAI-compatible endpoint:

```powershell
$env:OPENAI_BASE_URL = 'http://127.0.0.1:8787/v1'
$env:OPENAI_API_KEY = '<molenkopf-api-key>'
codex
```

If a client must also send its upstream provider credential in `Authorization`,
send the Molenkopf key as `x-molenkopf-token: mk_...`; Molenkopf strips local
headers before forwarding upstream.

5. Docker on the host:

```bash
cp .env.example .env
# Edit .env and set a unique MOLENKOPF_SESSION_SECRET.
docker run --rm --env-file .env -p 127.0.0.1:8787:8787 -v molenkopf-data:/data ghcr.io/bothat-io/molenkopf:latest
```

6. Source checkout for local development:

```bash
npm run bootstrap
cp .env.example .env
# Edit .env and set a unique MOLENKOPF_SESSION_SECRET.
npm run dev
```

Use `docs/DEPLOYMENT.md` when you need a different port or non-loopback access.

## Screenshot

![Molenkopf dashboard overview](docs/assets/dashboard-overview.png)

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
- `project-graph-plugin`: derives graph metadata from token usage and scoped audit
  metadata without scanning source files or storing prompts/responses.
- Static pipeline with request IDs, redaction, classification, compression, retrieval, audit, SSE events, and upstream routing.
- Local API under `/__molenkopf/*`: bootstrap endpoints for health, session
  status, and first-run admin creation, user-scoped usage/key endpoints, and admin-only
  provider/plugin/agent/stats/events/config metadata plus retention purge.
- Dashboard shell served at `/__molenkopf/dashboard` with Overview and Admin
  views backed by an isolated React/Vite dashboard package. Dedicated Providers,
  Plugins, Requests, Audit, Agents, and Settings views are planned.
- Plugin pages are local HTML surfaces under `/__molenkopf/plugins/:id/page`; context compression, token optimization, and project graph pages read scoped plugin data endpoints and show explicit load errors instead of fake empty workspaces.
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

Root `/` opens the dashboard at `/__molenkopf/dashboard`; upstream agent traffic
stays on `/v1/...` and requires a Molenkopf API key.

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

Plugin pages open in standalone windows from `/__molenkopf/plugins/context-compressor-plugin/page`, `/__molenkopf/plugins/token-optimizer-plugin/page`, and `/__molenkopf/plugins/project-graph-plugin/page`. The `project-graph-plugin` workspace is derived from token usage and scoped audit metadata, not source scans or raw prompts. Plugin pages group by project/key where available and surface plugin-data failures explicitly.

## Limitations

Provider token accounting uses upstream `usage` when present and falls back to bounded estimates for local compression pressure. JSON summaries are readable summaries, not guaranteed valid JSON. v0.1 does not retry provider failures automatically and request-side safe compression remains opt-in.

Be careful with secrets and private repositories. Molenkopf reduces accidental
exposure, but local retrieval stores still contain bounded redacted excerpts.
They do not support full-original recovery and should be treated as sensitive
local artifacts.

## License

MIT License. Copyright (c) 2026 bothat.io and Molenkopf contributors.
