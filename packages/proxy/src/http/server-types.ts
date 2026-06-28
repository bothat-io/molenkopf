import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { ResolvedAgent } from "./runtime-types.ts";

export type ProxyOptions = {
  target: string;
  port: number;
  host?: string;
  allowPublicBind?: boolean;
  dataDir?: string;
  providers?: ProviderConfig[];
  activeProviderId?: string;
  configAgents?: ResolvedAgent[];
  providerCatalogMode?: "auto" | "explicit";
  configSource?: { kind: "env" | "file"; path?: string };
};

export type RunningProxy = { port: number; close: () => Promise<void> };
