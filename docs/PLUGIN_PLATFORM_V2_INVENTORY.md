# Plugin Platform v2 Inventory

This is the binding inventory for the current local built-in plugin platform.

## 1. Descriptor and registry state

- Descriptor source: `packages/core/src/plugins/plugin-descriptor-v2.ts`
  - `PluginDescriptorV2`: runtime policy shape (`risk`, `capabilities`,
    `settingsSchema`, `actions`, `defaultPolicy`, `workspace`, `dataScopes`,
    `modulePath`)
- Legacy catalog adapter: `packages/core/src/plugins/plugin-descriptor.ts`
- Derived catalog: `packages/core/src/plugins/plugin-catalog.ts`
- Built-ins: `packages/core/src/plugins/builtin-plugin-descriptors.ts`
- Built-in descriptors/modules:
  - `context-compressor-plugin` -> `packages/plugins/context-compressor-plugin/descriptor-v2.ts`, `plugin.ts`, `page.html`
  - `obsidian-graph-plugin` -> `packages/plugins/obsidian-graph-plugin/descriptor-v2.ts`, `plugin.ts`, `page.html`
  - `token-optimizer-plugin` -> `packages/plugins/token-optimizer-plugin/descriptor-v2.ts`, `plugin.ts`, `page.html`

## 2. Hardcoded plugin routes and request decisions

### Local API
- `GET /__molenkopf/plugins`
  - Handler: `packages/proxy/src/http/local-api.ts`
  - Reads plugin state via `local-api-state.ts`
- `POST /__molenkopf/plugins/toggle`
  - Handler: `local-api-plugin-actions.ts`
  - Persists `pluginEnabled` in runtime settings
- `GET /__molenkopf/plugins/:id/page`
  - Handler: `plugin-page-loader.ts`
- `GET /__molenkopf/plugins/:id/data`
  - Handler: `buildPluginData()` in `plugin-data.ts`
- `POST /__molenkopf/plugins/:id/actions/:actionId`
  - Handler: `runPluginAction()` in `local-api-plugin-actions.ts`
  - Requires descriptor action metadata and effective policy permission
- `POST /__molenkopf/plugins/reorder`
  - Current UI-only pipeline reordering endpoint

### Proxy/request path
- `server.ts`:
  - policy input from `effectiveRequestPolicy(...)`
  - request plugin gate in `pluginActive`
  - graph extraction for obsidian path
- `request-finish.ts`:
  - `obsidian-graph-plugin` gate before `recordCommunicationGraph(...)`
- `plugin-host.ts`:
  - plugin event/audit iteration and note/emit handling

## 3. Existing helper usage to migrate

- `packages/proxy/src/http/runtime-state.ts`
  - `isPluginEnabled(state, id)`
  - `enabledPluginIds(state)`
- `packages/proxy/src/http/server.ts`
  - request-time `pluginActive`
- `packages/proxy/src/http/request-finish.ts`
  - plugin gate for communication graph
- `packages/proxy/src/http/request-policy.ts`
  - `pluginAllowedByPolicy(...)` currently limited, agent-aware only
- `packages/proxy/src/http/plugin-host.ts`
  - lifecycle/event/audit iteration and filtering behavior

## 4. Plugin data sources

- Execution source for plugins:
  - descriptor/catalog (`pluginCatalog`) and local API state
- Runtime execution:
  - `plugin-host.ts` calls `onRequest`, `onAudit`, `onEvent`, `getData`
- Plugin data payload currently passes through `buildPluginData` and `safePluginOutput`
- Page assets:
  - loaded by `plugin-page-loader.ts` from plugin directories

## 5. Dashboard links

- Plugin list in API: `packages/dashboard/src/app/api.ts`
- Provider sections use plugin list and plugin page open checks
- Plugin pages are still linked from Local API route shape above

## 6. Tests touching current behavior

- Core
  - `packages/core/test/plugin-descriptor.test.ts`
- Proxy
  - `packages/proxy/test/plugin-action-router.test.ts`
  - `packages/proxy/test/plugin-host.test.ts`
  - `packages/proxy/test/plugin-folder-pages.test.ts`
  - `packages/proxy/test/proxy-plugin-data.test.ts`
  - `packages/proxy/test/proxy-graph-failure.test.ts`
  - `packages/proxy/test/container-command-smoke.test.ts`
  - `packages/proxy/test/proxy-e2e.test.ts`

## 7. Remaining migration targets

- Replace legacy helper usage with request-policy-aware checks (or explicit source-of-truth flags) in:
  - `server.ts` request plugin gate
  - `plugin-host.ts` lifecycle/event/audit iteration filters
  - `request-finish.ts` communication-graph gate
- Keep route shape (`/__molenkopf/plugins/:id/page`, `/__molenkopf/plugins/:id/data`) in phase 0
- Keep behavior unchanged until phase 1 validation is complete, except for explicit preparatory cleanup already in place.

## 8. Inventory done criteria

- Inventory exists and is complete.
- Migration target for each legacy route/helper is documented.
- No new source-of-truth contract is introduced before explicit Phase 1+ gates.
