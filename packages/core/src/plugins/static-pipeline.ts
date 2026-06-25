export const staticPluginPipeline = [
  "context-compressor-plugin"
] as const;

export type StaticPluginName = typeof staticPluginPipeline[number];
