import type { AuditManifest } from "../manifest/audit-store.ts";
import type { MemoryGraph } from "../memory/memory-graph.ts";

export type PluginJson = Record<string, unknown>;

export type PluginBlock = {
  status: number;
  error: string;
};

export type PluginUsage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
};

export type PluginMetrics = {
  redactedSecrets: number;
  compressedItems: number;
  savedTokens: number;
  retrievalIds: string[];
  compressorsUsed: string[];
  compressionCandidates?: number;
  compressionSkipped?: number;
  skipReasons?: Record<string, number>;
  contentKindCounts?: Record<string, number>;
  originalBytes?: number;
  forwardedBytes?: number;
  compressionRatio?: number;
  potentialCompressedItems?: number;
  potentialSavedTokens?: number;
  potentialSavedBytes?: number;
  protectedSourceTokens?: number;
  protectedDiffTokens?: number;
  contentFingerprints?: AuditManifest["contentFingerprints"];
  effectivePluginIds?: string[];
  compressorMode?: string;
  zeroSavingsReasons?: string[];
};

export type PluginLifecycleContext = {
  pluginId: string;
  dataDir?: string;
  now: () => Date;
  note: (message: string) => void;
  port?: number;
  reason?: string;
};

export type PluginRequestContext = {
  requestId: string;
  method: string;
  path: string;
  consumerId: string;
  providerId: string;
  body: string;
  settings: Record<string, unknown>;
  usageOf: (consumerId: string) => PluginUsage;
  note: (message: string) => void;
};

export type PluginRequestResult = Partial<PluginMetrics> & {
  body?: string;
  providerId?: string;
  block?: PluginBlock;
  notes?: string[];
  audit?: PluginJson[];
  events?: PluginJson[];
};

export type PluginAuditContext = {
  requestId: string;
  providerId: string;
  statusCode: number;
  manifest: PluginJson;
  note: (message: string) => void;
};

export type PluginEventContext = {
  event: string;
  data: PluginJson;
  emit: (event: string, data: PluginJson) => void;
};

export type PluginDataContext = {
  canManage: boolean;
  userId?: string;
  teamIds: string[];
  scope: string;
  plugin: PluginJson;
  scopes: string[];
  manifests: AuditManifest[];
  memoryGraph?: MemoryGraph;
};

export type PluginActionContext = {
  actionId: string;
  input: PluginJson;
  userId?: string;
  teamIds: string[];
  scope: string;
  manifests?: AuditManifest[];
};

export type PluginRuntimeContext = {
  pluginId: string;
  dataDir?: string;
  storage?: unknown;
  fingerprintSecret?: string;
  now: () => Date;
};

export type MolenkopfPluginModule = {
  onBoot?: (ctx: PluginLifecycleContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  onStart?: (ctx: PluginLifecycleContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  onEnable?: (ctx: PluginLifecycleContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  onDisable?: (ctx: PluginLifecycleContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  onRequest?: (ctx: PluginRequestContext, runtime: PluginRuntimeContext) => PluginRequestResult | void | Promise<PluginRequestResult | void>;
  onAudit?: (ctx: PluginAuditContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  onEvent?: (ctx: PluginEventContext, runtime: PluginRuntimeContext) => void | Promise<void>;
  getData?: (ctx: PluginDataContext, runtime: PluginRuntimeContext) => PluginJson | Promise<PluginJson>;
  executeAction?: (action: PluginActionContext, runtime: PluginRuntimeContext) => PluginJson | Promise<PluginJson>;
  onStop?: (ctx: PluginLifecycleContext, runtime: PluginRuntimeContext) => void | Promise<void>;
};
