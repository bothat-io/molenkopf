import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { defaultDataDir } from "../storage/local-paths.ts";
import { chmodPrivate, ensurePrivateDir, PRIVATE_FILE_MODE, writePrivateFile } from "../storage/private-state.ts";
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
    await atomicPairWrite(dir, hash, boundedExcerpt(text), JSON.stringify(full, null, 2));
    return { id: `${RETRIEVAL_PREFIX}${hash}`, meta: full };
  }

  idFor(text: string): string {
    return `${RETRIEVAL_PREFIX}${sha256(text)}`;
  }

  async retrieve(id: string): Promise<string> {
    const hash = this.hashFromId(id);
    await this.checkedMetadata(hash);
    return readFile(join(this.dirFor(hash), `${hash}.txt`), "utf8");
  }

  async metadata(id: string): Promise<RetrievalMeta> {
    const hash = this.hashFromId(id);
    return this.checkedMetadata(hash);
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

  private async checkedMetadata(hash: string): Promise<RetrievalMeta> {
    const meta = JSON.parse(await readFile(join(this.dirFor(hash), `${hash}.json`), "utf8")) as RetrievalMeta;
    if (!isRetrievalMeta(meta) || meta.hash !== hash) throw new Error("invalid retrieval metadata");
    return meta;
  }
}

async function atomicPairWrite(dir: string, hash: string, text: string, json: string): Promise<void> {
  const suffix = `${process.pid}-${Date.now()}`;
  const textTmp = join(dir, `${hash}.${suffix}.txt.tmp`);
  const jsonTmp = join(dir, `${hash}.${suffix}.json.tmp`);
  const textPath = join(dir, `${hash}.txt`);
  const jsonPath = join(dir, `${hash}.json`);
  try {
    await writePrivateFile(textTmp, text);
    await writePrivateFile(jsonTmp, json);
    await rename(textTmp, textPath);
    await chmodPrivate(textPath, PRIVATE_FILE_MODE);
    await rename(jsonTmp, jsonPath);
    await chmodPrivate(jsonPath, PRIVATE_FILE_MODE);
  } catch (err) {
    await rm(textTmp, { force: true }).catch(() => {});
    await rm(jsonTmp, { force: true }).catch(() => {});
    throw err;
  }
}

function isRetrievalMeta(value: unknown): value is RetrievalMeta {
  if (!value || typeof value !== "object") return false;
  const item = value as RetrievalMeta;
  return /^[a-f0-9]{64}$/.test(item.hash) && typeof item.createdAt === "string" && typeof item.contentKind === "string"
    && typeof item.originalBytes === "number" && typeof item.compressedBytes === "number"
    && typeof item.compressorName === "string" && typeof item.redacted === "boolean"
    && (item.requestId === undefined || typeof item.requestId === "string");
}

function boundedExcerpt(text: string): string {
  const excerpt = text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS)}\n[TRUNCATED_CONTEXT:${text.length - EXCERPT_CHARS}_CHARS]` : text;
  return `Context excerpt only. Full original content is not persisted.\n${excerpt}`;
}
