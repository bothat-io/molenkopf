# Molenkopf JSON Config Plan

Date: 2026-06-18

Status: historical target plan with implemented slices. Use
`docs/MOLENKOPF_USAGE.md` for current setup instructions.

This is the source plan for making `molenkopf.config.json` the canonical
operator configuration. Provider API keys should be referenced from environment
variables or another local secret source, not committed inline. Inline
credentials are rejected in file config. The current ENV provider
blocks stay as a transition path only when no JSON config exists. They are not
the long-term provider, agent, routing, or plugin policy model.

## Goal

Molenkopf needs one readable config file for provider accounts, explicit
employee and agent bindings, plugin policies, routing, budgets, and safe
operator defaults. Employees receive Molenkopf tokens and setup snippets. They
do not receive upstream OpenAI, Anthropic, Claude, Codex, or browser session
credentials.

```text
agent / employee client
  -> Molenkopf token
  -> agent config binding
  -> provider profile
  -> plugin policy
  -> credentialRef resolver at forwarding boundary
  -> upstream provider or local runtime
```

## Current Reality

- A first JSON config loader exists for provider startup and validation.
- `provider-catalog.ts` can build ENV providers or explicit JSON
  providers.
- `MOLENKOPF_PROVIDER_IDS` can still define many providers when no JSON config
  exists, but this is not an
  operator-friendly source of truth.
- Runtime routing supports manual/distributed modes, project-attributed API
  keys, team provider allowlists, and explicit provider profiles.
- Agent rows are routing metadata; authenticated users and API keys live in the
  local identity store.
- Selected ENV providers inject server-side credentials and strip incoming auth.
- Local/no-auth provider modes strip incoming client credentials; credentialed
  provider profiles inject configured credentials at the boundary.
- `__molenkopf/*` control APIs are gated once an admin exists.

## Non-Negotiables

- No provider credential values in JSON.
- No Claude, Codex, ChatGPT, browser, or session login tokens in JSON.
- No full prompts, full responses, cookies, authorization headers, or raw tokens
  in config, audit, dashboard, events, or plugin pages.
- Multi-account routing only through explicit provider profiles.
- Employees get Molenkopf `mk_...` tokens; upstream credentials stay server-side.
- Token values are shown once and stored only as hashes.
- Core and proxy keep Node built-ins only.
- Config validation fails before the proxy binds a port.

## Config File

Default file:

```text
molenkopf.config.json
```

Resolution order:

```text
--config FILE
  -> MOLENKOPF_CONFIG_FILE
  -> ./molenkopf.config.json
  -> ./.molenkopf/config.json
  -> ENV provider discovery when no file exists
```

`--env-file` remains useful, but only to load referenced secret ENV values
before validating the JSON config. If an explicit config path is missing or
invalid, startup fails. If no default config exists, ENV provider discovery is
used.

## V1 JSON Shape

```json
{
  "schemaVersion": 1,
  "server": {
    "bindHost": "127.0.0.1",
    "port": 8787,
    "allowPublicBind": false,
    "dataDir": ".molenkopf"
  },
  "providers": [
    {
      "id": "openai-main",
      "name": "OpenAI Main",
      "kind": "openai-compatible",
      "baseUrl": "https://api.openai.com/v1",
      "auth": { "scheme": "bearer", "credentialRef": "env:OPENAI_MAIN_API_KEY" },
      "enabled": true
    },
    {
      "id": "claude-main",
      "name": "Claude Main",
      "kind": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1",
      "auth": { "scheme": "x-api-key", "credentialRef": "env:ANTHROPIC_MAIN_API_KEY" },
      "enabled": true
    }
  ],
  "profiles": [
    {
      "id": "default-local",
      "providerId": "openai-main",
      "routing": { "mode": "fixed" },
      "allowedModels": ["gpt-4.1-mini"],
      "defaultModel": "gpt-4.1-mini",
      "budget": { "tokensPerDay": 100000, "requestsPerDay": 1000 }
    }
  ],
  "pluginPolicies": [
    {
      "id": "standard-policy",
      "enabledPluginIds": ["context-compressor-plugin"],
      "remotePlugins": false
    }
  ],
  "agents": [
    {
      "id": "operator-codex-local",
      "ownerId": "operator",
      "kind": "local-agent",
      "profileId": "default-local",
      "pluginPolicyId": "standard-policy",
      "scopes": ["proxy:use"],
      "enabled": true
    }
  ],
  "safety": {
    "storeCredentialValues": false,
    "auditBodies": "metadata-only",
    "logFullPrompts": false,
    "logFullResponses": false,
    "redactSecrets": true
  }
}
```

## Validation Contract

Reject before startup:

- duplicate provider, profile, policy, or agent IDs
- provider IDs outside `[a-z0-9][a-z0-9._:-]*`
- URLs with username, password, query string, or non-HTTP protocols
- `credentialRef` values other than `env:NAME` or `none`
- ambiguous secret fields such as `apiKey`, `token`, `secret`, `authorization`,
  `cookie`, or `password`; use `auth.credentialRef` for referenced credentials
- raw secret-looking fields such as `apiKey`, `token`, `secret`,
  `authorization`, `cookie`, or `password`
- missing provider/profile/policy references from agents
- active or default routing to disabled providers
- non-loopback bind without explicit public-bind opt-in in hardened mode

Show only redacted metadata through local APIs and dashboard:

```text
credentialRef
credentialConfigured: true | false
provider/profile/policy IDs
target host
tokenHashPresent
tokenFingerprint
```

## Execution

Implementation packages, exact test files, and release gates live in
[MOLENKOPF_JSON_CONFIG_WORKPACKAGES.md](MOLENKOPF_JSON_CONFIG_WORKPACKAGES.md).

Build J0 and J1 first. That gives a real `molenkopf.config.json` contract,
startup validation, and file discovery without turning the dashboard into an
unsafe config editor. J2 can then switch routing to the JSON providers with
tests proving credentials stay server-side.
