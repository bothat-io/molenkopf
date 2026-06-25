import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultDataDir } from "../storage/local-paths.ts";
import { ensurePrivateDir, writePrivateFile } from "../storage/private-state.ts";
import { purgeChildDir } from "../storage/purge-dir.ts";
import { sha256 } from "../utils/hash.ts";
import { byteLength } from "../utils/text.ts";

export type RetrievalMeta = {
  hash: string;
  createdAt: string;
  contentKind: string;
  originalBytes: number;
  compressedBytes: number;
  compressorName: string;
  redacted: boolean;
  requestId?: string;
};

const EXCERPT_CHARS = 320;
const RETRIEVAL_PREFIX = "molenkopf://sha256/";

export class RetrievalStore {
  private root: string;

  constructor(root = defaultDataDir()) {
    this.root = root;
  }

  async save(text: string, meta: Omit<RetrievalMeta, "hash" | "createdAt" | "originalBytes">): Promise<{ id: string; meta: RetrievalMeta }> {
    const hash = sha256(text);
    const full: RetrievalMeta = { hash, createdAt: new Date().toISOString(), originalBytes: byteLength(text), ...meta };
    const dir = this.dirFor(hash);
    await ensurePrivateDir(dir);
    await writePrivateFile(join(dir, `${hash}.txt`), boundedExcerpt(text));
    await writePrivateFile(join(dir, `${hash}.json`), JSON.stringify(full, null, 2));
    return { id: `${RETRIEVAL_PREFIX}${hash}`, meta: full };
  }

  idFor(text: string): string {
    return `${RETRIEVAL_PREFIX}${sha256(text)}`;
  }

  async retrieve(id: string): Promise<string> {
    const hash = this.hashFromId(id);
    return readFile(join(this.dirFor(hash), `${hash}.txt`), "utf8");
  }

  async metadata(id: string): Promise<RetrievalMeta> {
    const hash = this.hashFromId(id);
    return JSON.parse(await readFile(join(this.dirFor(hash), `${hash}.json`), "utf8")) as RetrievalMeta;
  }

  async purgeAll(): Promise<void> {
    await purgeChildDir(this.root, "store");
  }

  private hashFromId(id: string): string {
    if (!id.startsWith(RETRIEVAL_PREFIX)) throw new Error("invalid retrieval id");
    const hash = id.slice(RETRIEVAL_PREFIX.length).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("invalid retrieval id");
    return hash;
  }

  private dirFor(hash: string): string {
    return join(this.root, "store", "sha256", hash.slice(0, 2), hash.slice(2, 4));
  }
}

function boundedExcerpt(text: string): string {
  const excerpt = text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}\n[TRUNCATED_CONTEXT:${text.length - EXCERPT_CHARS}_CHARS]` : text;
  return `Context excerpt only. Full original content is not persisted.\n${excerpt}`;
}
