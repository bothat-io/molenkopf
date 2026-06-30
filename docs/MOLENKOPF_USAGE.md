# Molenkopf Usage

This is the practical local test flow for Molenkopf.

## Start

```bash
cp .env.example .env
# Edit .env and set MOLENKOPF_SESSION_SECRET.
npm run dev
```

Source runs load `./.env` automatically without overriding values already
exported in your shell.

Open `http://127.0.0.1:8787/__molenkopf/dashboard`. Use
`http://127.0.0.1:8787/v1` as the OpenAI-compatible base URL in local clients.

## Authenticate Proxy Traffic

Create a Molenkopf API key in the dashboard after first-run setup. Every
`/v1/...` proxy request needs that key. Use `Authorization: Bearer mk_...` when
Molenkopf supplies provider credentials. If your client also needs to forward an
upstream `Authorization` header, send the Molenkopf key as `x-molenkopf-token`.

```text
Authorization: Bearer mk_...
x-molenkopf-token: mk_...
```

`x-molenkopf-agent` is optional local request metadata. It can select only an
agent/provider binding already allowed by the authenticated key, team, and
profile policy. Molenkopf strips local Molenkopf auth and routing headers before
forwarding upstream.

## Test Request

Send a normal OpenAI-compatible request through the proxy. Then refresh the dashboard.

```bash
MOLENKOPF_API_KEY="mk_..."
curl http://127.0.0.1:8787/v1/responses \
  -H "x-molenkopf-token: ${MOLENKOPF_API_KEY}" \
  -H "authorization: Bearer ${OPENAI_API_KEY}" \
  -H "content-type: application/json" \
  -d '{"model":"gpt-4.1-mini","input":"short local test"}'
```

PowerShell:

```powershell
$env:MOLENKOPF_API_KEY = "mk_..."
curl.exe http://127.0.0.1:8787/v1/responses `
  -H "x-molenkopf-token: $env:MOLENKOPF_API_KEY" `
  -H "authorization: Bearer $env:OPENAI_API_KEY" `
  -H "content-type: application/json" `
  -d '{ "model": "gpt-4.1-mini", "input": "short local test" }'
```

Expected result:

- `/__molenkopf/requests/latest` returns a redacted audit manifest for an
  authenticated admin session.
- `Dashboard -> Overview` updates after refresh or polling.
- `Context compression flow` increments request and token counters.
- `project-graph-plugin` derives graph metadata from observed token/audit
  metadata without scanning local source files.

## Provider Setup

`molenkopf.config.json` is the provider startup source when present or passed
  with `--config`. Provider API keys must be referenced from environment
variables with `auth.credentialRef`, for example `env:OPENAI_MAIN_API_KEY`.
Inline credentials are rejected in file config. The setup for ENV-defined
providers remains in
[MOLENKOPF_PROVIDER_ENV.md](MOLENKOPF_PROVIDER_ENV.md).

Start from the example:

```powershell
Copy-Item molenkopf.config.example.json molenkopf.config.json
$env:OPENAI_MAIN_API_KEY = "<your OpenAI API key>"
$env:ANTHROPIC_MAIN_API_KEY = "<your Anthropic API key>"
molenkopf proxy --config molenkopf.config.json
```

Then inspect:

```text
http://127.0.0.1:8787/__molenkopf/providers
http://127.0.0.1:8787/__molenkopf/config
```

Expected:

- only the JSON providers are listed
- `credentialRef: env:OPENAI_MAIN_API_KEY` and `credentialConfigured: true`
  are visible after the environment variable is set
- real API key values are loaded from the local environment but not returned by
  Local API
- no ENV provider blocks are mixed into JSON startup

### Local CLI And Local Models

Use `kind: "cli-claude"` or `kind: "cli-codex"` for local CLI accounts, and
`kind: "ollama"` or `kind: "local"` for local OpenAI-compatible model
servers. Runtime-auth imports run CLI providers with isolated local auth/profile
directories. Provider switching is visible in Admin; explicit agent bindings can
route `x-molenkopf-agent` values to configured providers without bypassing
team/provider allowlists or API-key scopes.

Providers added through the Admin form are runtime state unless represented by
JSON config, env configuration, or imported runtime-auth metadata.

## Users, Teams, Projects, And Keys

Molenkopf separates project attribution from team policy:

- `Project` is required on every API key. It describes the workload that uses
  the key, for example `project-a`, `billing-batch`, or `local-test`.
- `Team` is the organizational policy bucket. Teams own provider allowlists,
  budget accounting, and scoped visibility. First-run setup creates the default
  `everyone` team for the first admin.
- `User` is the login and key owner. Users can belong to one or more teams.

Dashboard support: Admin manages users, teams, providers, and system controls;
Overview lets the signed-in user create and revoke permitted project keys. Raw
key secrets are shown once only.

Local API support:

| Action | Endpoint |
| --- | --- |
| List users and teams | `GET /__molenkopf/identity` |
| Create/update user | `POST /__molenkopf/identity/users` |
| Remove user | `POST /__molenkopf/identity/users/remove` |
| Create/update team | `POST /__molenkopf/identity/teams` |
| Remove team | `POST /__molenkopf/identity/teams/remove` |
| Create/list/revoke keys | `/__molenkopf/keys` and `/__molenkopf/keys/revoke` |

If a user belongs to multiple teams, key creation must choose the team. If a
user belongs to one team, Molenkopf can use that team automatically.

## Troubleshooting

- Dashboard stuck on `connecting`: restart the proxy so the current dashboard bundle is served.
- `EADDRINUSE`: another proxy is already listening on the port; stop that process or start on another port.
- `invalid_api_key`: create a Molenkopf project key in the dashboard and send it
  as `Authorization: Bearer mk_...` or `x-molenkopf-token: mk_...`.
- `OPENAI_API_KEY missing`: set the provider environment variable or forward an
  upstream `Authorization` header with `x-molenkopf-token` for Molenkopf auth.
- No graph nodes: send API traffic through `/v1/...`; internal dashboard requests are intentionally ignored.
- Saved tokens stay `0`: the payload may be small or the compressor is disabled.
- Imported Claude auth works but write/edit prompts still appear: that is the outer Claude harness permission profile, not the imported runtime auth. Track and fix this separately from provider auth.
- Claude/Codex no-response: use the provider card `Test` action first. Molenkopf reports spawned CLI lifecycle, timeout, malformed output, and permission-prompt classes for the child process it owns.

## Current Dashboard Views

- `Overview`: connection status, signed-in user usage, teams, members, project
  keys, and client connection snippets.
- `Admin`: users, teams, provider accounts, routing, plugin controls, imported runtime auth, and workspace links.

Dedicated Providers, Plugins, Requests, Audit, Agents, and Settings views are
planned in `ROADMAP.md`. Until then, use the local APIs and plugin pages below
for request/audit/plugin details.

## Plugin Pages And Data

Open plugin pages from the Admin plugin section. Context compression owns token
pressure and savings views. Token optimizer owns recommendation summaries.
`project-graph-plugin` owns token-derived graph metadata only; it does not scan source
roots, read an Obsidian vault, or render raw source, prompt, or response
content.

## Current Boundaries

- No full prompts or full responses are displayed.
- File config rejects inline raw API credentials; use `auth.credentialRef`.
  Provider credentials entered in the dashboard and imported runtime auth are
  intentional local operator state, and Local API responses do not display
  credential values.
- Token hash drafts store hash metadata only; list responses show only that a hash exists plus a short fingerprint.
- Provider routing is explicit: teams carry provider allowlists, API keys carry
  project attribution, and provider selection can be manual or distributed by
  configured profile.
- Plugin toggle and order state persists in local runtime settings. Locked
  plugin settings are normalized back to safe defaults on startup.

## Verification

Run:

```bash
npm test
```

The relevant checks cover dashboard rendering, script parsing, provider/plugin controls, agent draft safety, audit summaries, plugin pages, and proxy behavior.
