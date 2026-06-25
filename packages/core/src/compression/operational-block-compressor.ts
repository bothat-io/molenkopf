import { classifyContent } from "./content-classifier.ts";
import { compressJsonText } from "./json-compressor.ts";
import { compressLog } from "./log-compressor.ts";
import { compressStacktrace } from "./stacktrace-compressor.ts";
import { byteLength } from "../utils/text.ts";

export type OperationalBlockCompression = {
  text: string;
  compressed: boolean;
  kind?: string;
  compressorName?: string;
};

const COMPRESSIBLE = new Set(["json", "stacktrace", "log", "shell_output"]);
const SOURCE_LANGS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "rb", "sql", "diff", "patch", "md", "markdown", "sh", "bash", "zsh", "fish", "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts", "html", "css"]);
const OPERATIONAL_LANGS = new Set(["log", "logs", "output", "shell-output", "terminal"]);
const FENCE = /```([a-z0-9_-]*)[^\n]*\n([\s\S]*?)```/gi;

export function compressOperationalBlocks(text: string, retrieveId: string): OperationalBlockCompression {
  let compressed = false;
  let kind: string | undefined;
  let compressorName: string | undefined;
  const rewritten = text.replace(FENCE, (match, lang: string, body: string) => {
    const normalizedLang = lang.toLowerCase();
    if (SOURCE_LANGS.has(normalizedLang) || body.length < 2000) return match;
    if (normalizedLang && !OPERATIONAL_LANGS.has(normalizedLang)) return match;
    const blockKind = classifyContent(body);
    if (!COMPRESSIBLE.has(blockKind)) return match;
    const result = compressStructured(blockKind, body, retrieveId);
    if (!result.compressed || byteLength(result.text) >= byteLength(body)) return match;
    compressed = true;
    kind = blockKind;
    compressorName = `embedded-${result.compressorName}`;
    return "```" + lang + "\n" + result.text + "\n```";
  });
  return { text: rewritten, compressed, kind, compressorName };
}

function compressStructured(kind: string, text: string, retrieveId: string) {
  if (kind === "json") return compressJsonText(text, retrieveId);
  if (kind === "stacktrace") return compressStacktrace(text, retrieveId);
  return compressLog(text, retrieveId);
}
