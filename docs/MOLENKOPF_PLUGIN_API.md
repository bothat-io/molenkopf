# Molenkopf Plugin API

Molenkopf plugins are optional local extensions. Core safety, credential
handling, routing enforcement, audit invariants, and request redaction are core
responsibilities and are not exposed as plugins.

Each plugin is a TypeScript module at
`packages/plugins/<plugin-id>/plugin.ts`. It exports a static `descriptor` and
an executable `plugin` module.

The TypeScript descriptor remains the source of truth for permissions,
readable scopes, traffic mutations, workspace data, and default enabled state.
Runtime hook results are accepted only when the descriptor allows the matching
mutation.
Built-in local plugin modules are imported by the proxy from a static module
registry. Remote or downloaded plugin code is disabled.

## Descriptor

```ts
import type { PluginDescriptor } from "../../core/src/plugins/plugin-descriptor.ts";

export const descriptor: PluginDescriptor = {
  id: "context-compressor-plugin",
  name: "context-compressor-plugin",
  type: "transformer",
  category: "compression",
  description: "Compresses large safe context and keeps retrievable originals locally.",
  traffic: { reads: ["redacted-body", "audit"], mutates: ["transform"] },
  permissions: ["body:read", "body:write", "audit:read", "audit:write"],
  hooks: ["request:body:rewrite", "audit:manifest", "workspace:local-page"],
  toggle: { defaultEnabled: false, canDisable: true },
  modulePath: "plugin.ts"
};
```

`canDisable` is always `true` for visible plugins. If a feature is required for
Molenkopf to run safely, it belongs in Core instead of the plugin catalog.

## TypeScript Module

The public hook shape lives in `packages/core/src/plugins/plugin-api.ts`.

```ts
import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";

export const plugin: MolenkopfPluginModule = {
  onBoot(ctx) {
    ctx.note("plugin booted");
  },
  onStart(ctx) {
    ctx.note("plugin started");
  },
  onRequest(ctx) {
    return { body: ctx.body.toUpperCase(), notes: ["rewrote request"] };
  },
  getData(ctx) {
    return { plugin: ctx.plugin, requests: ctx.manifests.length };
  }
};
```

Available hooks:

| Hook | Purpose |
| --- | --- |
| `onBoot` | Prepare local plugin state before the proxy listens. |
| `onStart` | Initialize enabled plugin work after the proxy listens. |
| `onEnable` | React to an admin enabling the plugin. |
| `onDisable` | React to an admin disabling the plugin. |
| `onRequest` | Inspect or transform a redacted request. |
| `onAudit` | Observe redacted audit manifests. |
| `onEvent` | Observe or emit local lifecycle events. |
| `getData` | Serve scoped workspace data. |
| `onStop` | Flush local state before shutdown. |

`getData` receives already-scoped, already-redacted audit manifests plus safe
workspace context such as the plugin view, declared scopes, and the memory graph
when available. The central proxy does not contain plugin-specific metrics.

## Request Results

`onRequest` returns a result object instead of mutating global state directly.
The runner applies only the allowed fields:

```ts
type PluginRequestResult = {
  body?: string;
  providerId?: string;
  block?: { status: number; error: string };
  notes?: string[];
  redactedSecrets?: number;
  compressedItems?: number;
  savedTokens?: number;
  retrievalIds?: string[];
  compressorsUsed?: string[];
};
```

If a plugin returns a body rewrite without `traffic.mutates` containing
`transform`, `mask`, or `augment-context`, the runner restores the previous
body and blocks with `plugin_capability_violation`.

## Invariants

- Remote plugin loading is disabled.
- Core redaction runs before optional request plugins.
- Full prompts, full responses, credential values, cookies, and authorization
  headers must not appear in plugin data, audit data, dashboard data, events, or
  logs.
- Provider reroutes still pass provider, team, and key policy checks. Project is
  key-level attribution, not a provider access layer.
- A disabled plugin must leave Molenkopf usable.
