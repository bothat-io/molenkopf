import { readFile } from "node:fs/promises";

export async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 3000;
  for (;;) {
    try { return await readFile(path, "utf8"); } catch {}
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await delay(50);
  }
}

export async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { process.kill(pid, 0); } catch { return; }
    if (Date.now() > deadline) throw new Error(`process ${pid} did not exit`);
    await delay(50);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
