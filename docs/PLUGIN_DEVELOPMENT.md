# Plugin Development

Molenkopf plugins are local built-ins. They are packaged with the application,
loaded from the static module registry, and must not download remote code.

## Runtime contract

- Use `descriptor-v2.ts` as the runtime policy descriptor.
- Use `plugin.ts` for executable hooks and data handlers.
- Keep plugin-local formatting helpers separate from platform safety:
  - plugin-local shaping is optional
  - `safePluginOutput(...)` is mandatory before plugin data leaves the proxy
- Plugin storage writes must pass `safePluginStorageInput(...)`.

## Descriptor v2

Every executing built-in plugin must provide:

- `descriptorVersion: 2`
- `id`, `name`, `category`, `risk`
- `capabilities`
- `settingsSchema`
- `actions`
- `defaultPolicy`
- `workspace`
- `dataScopes`
- `modulePath`

`dataScopes` live at descriptor root and are the source of truth for plugin
data visibility.

## Policy model

MVP policy is two-layer only:

1. Global Plugin Policy
2. Team Plugin Policy

Team overrides inherit from Global by default and may only restrict it.

## Settings and actions

- `PluginMiniSchema` is the only supported schema shape.
- Unknown keys are rejected by default.
- Team overrides store only changed fields, not mirrored global copies.
- Actions must declare `inputSchema`, `outputSchema`, `requiredCapabilities`,
  `requiredRole`, `risk`, `confirmation`, `sideEffects`, and `outputSafety`.

## Safety invariants

- No raw prompt/response output in plugin data, events, logs, or dashboard data.
- No Authorization/Cookie/API-key leakage.
- No manager-specific policy write rights in MVP.
- Token Optimizer MVP is observe/recommend only and must not mutate traffic.
