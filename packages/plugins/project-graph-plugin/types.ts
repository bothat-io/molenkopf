export type ProjectGraphSettings = {
  includeExtensions: string[];
  excludePatterns: string[];
  maxFiles: number;
  maxFileBytes: number;
  maxDepth: number;
  followSymlinks: boolean;
};

export type ProjectFile = {
  absolutePath: string;
  relativePath: string;
  bytes: number;
};

export type ScanWarning = {
  code: string;
  path?: string;
  detail?: string;
};

export type DiscoveryResult = {
  rootPath: string;
  rootId: string;
  files: ProjectFile[];
  skipped: number;
  deniedPaths: string[];
  warnings: ScanWarning[];
};

export type GraphNodeKind = "project" | "file" | "symbol" | "import" | "export" | "route" | "test" | "pluginDescriptor" | "pluginAction" | "storageResource" | "event";
export type GraphEdgeKind = "contains" | "imports" | "exports" | "defines" | "tests" | "handlesRoute" | "declaresPlugin" | "declaresAction" | "readsStorage" | "writesStorage" | "emitsEvent" | "listensEvent" | "references";

export type ProjectGraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  path?: string;
  language?: string;
  symbolName?: string;
  lineStart?: number;
  lineEnd?: number;
  safeSignature?: string;
  metadata?: Record<string, unknown>;
};

export type ProjectGraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  weight?: number;
  evidence?: { path?: string; lineStart?: number; lineEnd?: number; extractor: string; confidence: number };
};

export type FileScanResult = {
  file: ProjectFile;
  language: string;
  symbols: ProjectGraphNode[];
  imports: ProjectGraphNode[];
  exports: ProjectGraphNode[];
  routes: ProjectGraphNode[];
  tests: ProjectGraphNode[];
  pluginFacts: ProjectGraphNode[];
  storage: ProjectGraphNode[];
  events: ProjectGraphNode[];
  warnings: ScanWarning[];
};

export type ProjectGraph = {
  schemaVersion: 1;
  projectId: string;
  rootId: string;
  generatedAt: string;
  nodes: ProjectGraphNode[];
  edges: ProjectGraphEdge[];
  stats: Record<string, number>;
  warnings: ScanWarning[];
};
