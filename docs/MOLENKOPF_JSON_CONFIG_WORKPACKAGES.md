# Molenkopf JSON Config Workpackages

Date: 2026-06-18

Status: historical work package plan with several implemented slices. Use
`docs/MOLENKOPF_USAGE.md` for the current release flow.

Execution plan for [MOLENKOPF_JSON_CONFIG_PLAN.md](MOLENKOPF_JSON_CONFIG_PLAN.md).
Keep each slice independently testable and do not add Core or Proxy
dependencies.

## J0: Config Contract In Core

Owners:

- `packages/core/src/config/molenkopf-config.ts`
- `packages/core/test/provider-config-json.test.ts`

Build:

- Parse and normalize `molenkopf.config.json`.
- Validate providers, profiles, plugin policies, agents, and safety settings.
- Reject duplicate IDs, unsafe URLs, invalid credential refs, and raw secrets.
- Expose typed config objects for Proxy without leaking raw parsed JSON.

Acceptance:

- Config accepts `auth.credentialRef` values such as `env:NAME`,
  `secret:id`, and `none`; inline credentials are rejected.
- Config rejects `apiKey`, `token`, `secret`, `credential`, `authorization`,
  `cookie`, and `password` anywhere in the JSON object.

## J1: Proxy Config Loader

Owners:

- `packages/proxy/src/cli/config-loader.ts`
- `packages/proxy/src/cli/main.ts`
- `packages/proxy/test/cli-config-file.test.ts`

Build:

- Add `--config FILE`.
- Resolve `--config`, `MOLENKOPF_CONFIG_FILE`, local discovery, then ENV provider discovery.
- Load `--env-file` before config validation.
- Let CLI flags override server fields only: host, port, target, dataDir.
- Fail startup for explicit missing or invalid config files.

Acceptance:

- No config file uses ENV provider discovery.
- Explicit config path missing fails before binding a port.
- Invalid JSON fails without printing secret-bearing input.

## J2: Provider Catalog From Config

Owners:

- `packages/core/src/providers/provider-catalog.ts`
- `packages/proxy/src/http/header-utils.ts`
- `packages/proxy/test/provider-credential-forwarding.test.ts`
- `packages/proxy/test/proxy-header-utils.test.ts`

Build:

- Make JSON providers the source when config exists.
- Do not mix `MOLENKOPF_PROVIDER_IDS` into explicit JSON config.
- Keep ENV provider blocks disabled whenever explicit JSON config exists.
- Missing env credential must not fall back to incoming client auth.

Acceptance:

- Two configured providers can coexist with different credential refs.
- Upstream receives only the selected server-side credential.
- Incoming `authorization`, `cookie`, `x-api-key`, and Molenkopf headers are
  stripped for configured credential providers.

## J3: Runtime State And Local API

Owners:

- `packages/proxy/src/http/runtime-state.ts`
- `packages/proxy/src/http/local-api-state.ts`
- `packages/proxy/test/proxy-control-plane.test.ts`

Build:

- Store normalized config metadata, not raw parsed JSON.
- Add source metadata to `/__molenkopf/config` and `/__molenkopf/providers`.
- Return only redacted config views.
- Show validation/source status in operator diagnostics.

Acceptance:

- API responses include `credentialRef` and `credentialConfigured`.
- API responses never include inline credentials, env values, raw tokens, full
  prompts, or full responses.

## J4: Security Gate Before Team Use

Owners:

- `packages/core/src/security/*`
- `packages/proxy/src/http/auth.ts`
- `packages/proxy/src/http/server.ts`

Build:

- Add Molenkopf token generation, hashing, verify, rotate, revoke.
- Protect local APIs by scope; leave only health public.
- Require `proxy:use` for upstream traffic.
- Sanitize query paths before audit, SSE, dashboard, graph, and plugin data.

Acceptance:

- Non-loopback bind without explicit opt-in fails in hardened mode.
- Query secrets never appear in audit, requests, stats, SSE, dashboard, or
  plugin pages.

## J5: Dashboard Operator UI

Owners:

- `packages/dashboard/src/dashboard-panels.ts`
- `packages/dashboard/src/dashboard-script-*.ts`
- `packages/dashboard/test/dashboard.test.ts`

Build:

- Add Config Source, Provider Profiles, Agent Bindings, Plugin Policies, and
  Validation Errors panels.
- Keep config writes disabled until authenticated manage scopes exist.
- Show redacted change previews before future writes.

Acceptance:

- Dashboard has no duplicate live badge and no layout overflow.
- No visible or stored dashboard state contains credential values.

## J6: Team Distribution

Owners:

- `packages/proxy/src/http/local-api.ts`
- `docs/ADMIN_DISTRIBUTION.md`

Build:

- Add employee and agent token create, rotate, revoke.
- Generate setup snippets with Molenkopf tokens only.
- Route by agent binding, not global active provider.

Acceptance:

- Two agents can route to two different provider profiles in one proxy process.
- Revoked or expired tokens cannot call `/v1/*`.

## J7: Plugin And Memory Policy

Owners:

- `packages/core/src/plugins/*`
- `packages/proxy/src/http/plugin-page-loader.ts`

Build:

- Attach plugin policies to agents.
- Keep remote plugins disabled until descriptor permissions and auth exist.
- Keep Obsidian writes dry-run first with vault path guards.

Acceptance:

- Every visible plugin toggle changes runtime behavior.
- Obsidian apply cannot write outside the selected vault root.

## Verification

Focused commands:

```powershell
npm test
```

Release gate:

```powershell
npm test
```
