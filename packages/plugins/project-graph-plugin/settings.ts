import type { PluginDescriptorV2 } from "../../core/src/plugins/plugin-descriptor-v2.ts";

const stringArray = (items: readonly string[] = [], maxLength = 100) => ({
  type: "array" as const,
  items: { type: "string" as const, maxLength: 120 },
  maxLength,
  default: items
});

export const projectGraphSettingsSchema: PluginDescriptorV2["settingsSchema"] = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    scanMode: { type: "enum", values: ["manual", "scheduled", "disabled"], orderedValues: ["disabled", "manual", "scheduled"], default: "manual", restrictiveMerge: "orderedMax" },
    allowedRootIds: { ...stringArray(), restrictiveMerge: "intersection" },
    includeExtensions: { ...stringArray([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md"]), restrictiveMerge: "intersection" },
    excludePatterns: { ...stringArray([".git/**", "node_modules/**", "dist/**", "build/**", "coverage/**", ".molenkopf/**", ".env*", "*.db", "*.sqlite", "*.pem", "*.key"]), restrictiveMerge: "maxWins" },
    maxFiles: { type: "integer", minimum: 1, maximum: 5000, default: 5000, restrictiveMerge: "minWins" },
    maxFileBytes: { type: "integer", minimum: 1, maximum: 524288, default: 524288, restrictiveMerge: "minWins" },
    maxDepth: { type: "integer", minimum: 1, maximum: 32, default: 32, restrictiveMerge: "minWins" },
    followSymlinks: { type: "boolean", default: false, restrictiveMerge: "falseWins" },
    persistSafeSignatures: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    detectRoutes: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    detectTests: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    detectPluginDescriptors: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    detectStorageUsage: { type: "boolean", default: true, restrictiveMerge: "falseWins" },
    detectEvents: { type: "boolean", default: true, restrictiveMerge: "falseWins" }
  }
};
