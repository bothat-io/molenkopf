# Molenkopf Plugin Interface Sketch

Status: future target sketch. The current implemented contract is
[MOLENKOPF_PLUGIN_API.md](MOLENKOPF_PLUGIN_API.md). Broad permissions in this
file are not current runtime behavior until they are added to
`packages/core/src/plugins/plugin-sdk.ts` and enforced by the proxy.

## Hook Phases

```ts
export type PluginHookPhase =
  | "request:start"
  | "request:headers"
  | "request:body"
  | "request:beforeForward"
  | "response:headers"
  | "response:body"
  | "audit:manifest"
  | "event:emit"
  | "memory:derive";
```

## Permissions

Current runtime permissions are intentionally narrower:
`metadata:read`, `body:read`, `body:write`, `audit:read`, `audit:write`,
`events:write`, and `provider:write`. The following target set is future-only.

```ts
export type PluginPermission =
  | "metadata:read"
  | "headers:read"
  | "headers:write"
  | "body:read"
  | "body:write"
  | "response:read"
  | "response:write"
  | "audit:write"
  | "events:write"
  | "memory:write"
  | "storage:write"
  | "metrics:write";
```

## Descriptor

```ts
export type PluginDescriptor<TConfig = unknown> = {
  id: string;
  name: string;
  category: "safety" | "compression" | "storage" | "events" | "routing" | "memory" | "visualization";
  version: string;
  pipelineIndex?: number;
  permissions: PluginPermission[];
  toggle: {
    defaultEnabled: boolean;
    canDisable: true;
  };
  workspace?: {
    title: string;
    pagePath: string;
    dataPath: string;
    dataScopes: Array<"status" | "metrics" | "audit-summary" | "requests" | "memory-graph">;
  };
  metrics?: Array<{
    name: string;
    kind: "counter" | "gauge" | "histogram";
    unit?: string;
  }>;
  config?: { defaults: TConfig };
  hooks: Partial<Record<PluginHookPhase, PluginHook>>;
};
```

## Hook Input

```ts
export type PluginHookContext = {
  requestId: string;
  now: string;
  method: string;
  path: string;
  rawPath: string;
  providerId: string;
  enabledPluginIds: string[];
  safeMetadata: Record<string, unknown>;
};

export type PluginHookInput = {
  context: PluginHookContext;
  headers?: Headers;
  body?: { mediaType?: string; text: string; redacted: boolean };
  response?: {
    status: number;
    headers: Headers;
    body?: { text: string; redacted: boolean };
  };
};
```

## Hook Result

```ts
export type PluginHookResult = {
  headers?: Headers;
  bodyText?: string;
  audit?: Record<string, unknown>;
  events?: Array<{ type: string; data: Record<string, unknown> }>;
  metrics?: Array<{ name: string; value: number; labels?: Record<string, string> }>;
  warnings?: string[];
};

export type PluginHook = (input: PluginHookInput) => PluginHookResult | Promise<PluginHookResult>;
```

## Rules

- Hook code is never returned by Local API.
- A plugin receives only data permitted by its descriptor.
- A toggle is visible only when disabling the plugin changes hook execution.
- Required safety behavior belongs in Core instead of the plugin catalog.
- Workspace pages read data through `workspace.dataPath`.
- Raw prompts, raw responses, and provider credentials are not workspace data.
