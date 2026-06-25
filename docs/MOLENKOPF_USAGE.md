# Molenkopf Usage

This is the practical local test flow for Molenkopf.

## Start

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8787/__molenkopf/dashboard
```

Use this as the OpenAI-compatible base URL in a local client:

```text
http://127.0.0.1:8787/v1
```

## Attribute Traffic

Optional local-only headers let the dashboard group usage:

```text
x-molenkopf-user: operator
x-molenkopf-agent: codex-local
```

Molenkopf strips these before forwarding upstream. If neither is present, it groups by a short fingerprint of `Authorization` or `x-api-key`, or by `anonymous`.

## Test Request

Send a normal OpenAI-compatible request through the proxy. Then refresh the dashboard.

```bash
curl http://127.0.0.1:8787/v1/responses ^
  -H "authorization: Bearer %OPENAI_API_KEY%" ^
  -H "content-type: application/json" ^
  -H "x-molenkopf-user: local-test" ^
  -d "{\"model\":\"gpt-4.1-mini\",\"input\":\"short local test\"}"
```

Expected result:

- `/__molenkopf/requests/latest` returns a redacted audit manifest for an
  authenticated admin session.
- `Dashboard -> Overview` updates after refresh or polling.
- `Context compression flow` increments request and token counters.
- `Memory graph workspace` shows text-derived safe graph data after transferred text is observed.

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
node --experimental-strip-types --experimental-sqlite --disable-warning=ExperimentalWarning packages/proxy/src/cli/main.ts proxy --config molenkopf.config.json
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
`kind: "ollama"` or `kind: "lmstudio"` for local OpenAI-compatible model
servers. Runtime-auth imports run CLI providers with isolated local auth/profile
directories. Provider switching is visible in Admin; explicit agent bindings can
route `x-molenkopf-agent` values to configured providers.

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
- `OPENAI_API_KEY missing`: set the environment variable or send an `Authorization` header from the client.
- No graph nodes: send API traffic through `/v1/...`; internal dashboard requests are intentionally ignored.
- Saved tokens stay `0`: the payload may be small or the compressor is disabled.
- Imported Claude auth works but write/edit prompts still appear: that is the outer Claude harness permission profile, not the imported runtime auth. Track and fix this separately from provider auth.
- Claude/Codex no-response: use the provider card `Test` action first. Molenkopf reports spawned CLI lifecycle, timeout, malformed output, and permission-prompt classes for the child process it owns.

## Current Dashboard Views

- `Overview`: connection status, signed-in user usage, teams, members, project
  keys, and client connection snippets.
- `Admin`: users, teams, provider accounts, routing, plugin controls, imported runtime auth, and workspace links.

Dedicated Providers, Plugins, Requests, Audit, Agents, and Settings views are
planned in `NEXT.md`. Until then, use the local APIs and plugin pages below for
request/audit/plugin details.

## Plugin Pages And Data

Open plugin pages from the Admin plugin section. Context compression owns token
pressure and savings views. The graph page is fed from redacted transferred text
and safe request metadata; it does not read an Obsidian vault yet and does not
render raw prompt or response content.

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
