import { rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export async function purgeChildDir(root: string, child: string): Promise<void> {
  const base = resolve(root);
  const target = resolve(base, child);
  const rel = relative(base, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("unsafe_purge_path");
  await rm(target, { recursive: true, force: true });
}
