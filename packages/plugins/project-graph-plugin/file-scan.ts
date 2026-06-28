import { readFileSync } from "node:fs";
import { detectLanguageFromPath, isSupportedLanguage } from "./language.ts";
import { extractEventUsage, extractPluginDescriptorFacts, extractStorageUsage } from "./fact-scanners.ts";
import { extractExports, extractImports } from "./import-export-scanner.ts";
import { extractRoutes } from "./route-scanner.ts";
import { extractTests } from "./test-scanner.ts";
import { extractTypeScriptSymbols } from "./ts-symbol-scanner.ts";
import type { FileScanResult, ProjectFile, ScanWarning } from "./types.ts";

export function scanProjectFile(file: ProjectFile): FileScanResult {
  const language = detectLanguageFromPath(file.relativePath);
  const warnings: ScanWarning[] = [];
  if (!isSupportedLanguage(language)) return emptyFileScanResult(file, language, warnings);
  const buffer = readFileSync(file.absolutePath);
  if (detectBinaryBuffer(buffer)) return emptyFileScanResult(file, language, [{ code: "binary_skipped", path: file.relativePath }]);
  const text = buffer.toString("utf8");
  return {
    file,
    language,
    symbols: extractTypeScriptSymbols(file.relativePath, text),
    imports: extractImports(file.relativePath, text),
    exports: extractExports(file.relativePath, text),
    routes: extractRoutes(file.relativePath, text),
    tests: extractTests(file.relativePath, text),
    pluginFacts: extractPluginDescriptorFacts(file.relativePath, text),
    storage: extractStorageUsage(file.relativePath, text),
    events: extractEventUsage(file.relativePath, text),
    warnings
  };
}

export function scanProjectFiles(files: ProjectFile[]): FileScanResult[] {
  return files.map((file) => scanProjectFile(file));
}

export function emptyFileScanResult(file: ProjectFile, language = detectLanguageFromPath(file.relativePath), warnings: ScanWarning[] = []): FileScanResult {
  return { file, language, symbols: [], imports: [], exports: [], routes: [], tests: [], pluginFacts: [], storage: [], events: [], warnings };
}

export function detectBinaryBuffer(buffer: Buffer): boolean {
  return buffer.includes(0);
}
