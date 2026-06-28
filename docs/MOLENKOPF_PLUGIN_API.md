# Molenkopf Plugin API

Molenkopf plugins are local modules. There is no remote plugin download, no
marketplace loader, and no runtime code fetch.

## Files

Each runtime plugin lives in `packages/plugins/<plugin-id>/` and uses:

- `descriptor-v2.ts`
- `plugin.ts`
- optional `page.html`

`descriptor-v2.ts` is the runtime contract. `plugin.ts` is the executable
module. Optional plugin-local shaping helpers never replace platform safety.

## Descriptor v2

```ts
export type PluginDescriptorV2 = {
  descriptorVersion: 2;
  id: string;
  name: string;
  category: PluginCategory;
  risk: PluginRisk;
  capabilities: readonly PluginCapability[];
  actions: readonly PluginActionDescriptor[];
  settingsSchema: PluginMiniSchema;
  defaultPolicy: PluginDefaultPolicy;
  workspace?: { pagePath?: string; dataPath?: string };
  dataScopes?: readonly PluginDataScope[];
  modulePath?: string;
};
```

Rules:

- `descriptorVersion` must be `2`
- mixed v1/v2 runtime is not allowed
- `modulePath` is required for executing plugins
- `dataScopes` live at descriptor root and are the source of truth
- `defaultPolicy` seeds missing persisted Global policy only

## Actions

Actions are declarative and validated by the generic router.

Required fields:

- `id`, `label`, `description`
- `requiredCapabilities`
- `requiredRole`
- `risk`
- `inputSchema`
- `outputSchema`
- `confirmation`
- `sideEffects`
- `auditEvent`
- `outputSafety`

`outputSafety` may be `strict` or `adminSafe`. It never bypasses
`safePluginOutput(...)`.

## Schemas

`PluginMiniSchema` is the only supported schema system for settings and action
payloads. It supports:

- `object`
- `string`
- `boolean`
- `integer`
- `number`
- `enum`
- `array`

It does not support `$ref`, `oneOf`, or recursive free-form structures.

## Runtime hooks

The executable contract lives in `packages/core/src/plugins/plugin-api.ts`.
Plugins may implement lifecycle, data, action, request, audit, and event hooks.
Hook enablement is still controlled by descriptor capability and effective
policy.

## Security invariants

- plugin output always passes `safePluginOutput(...)`
- plugin storage writes always pass `safePluginStorageInput(...)`
- no raw prompts, responses, secrets, Authorization, Cookie, or `mk_` tokens
- Token Optimizer MVP is observe/recommend only
- no Key/Agent plugin policy scope in MVP
