import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { startProxy } from "../../proxy/src/http/server.ts";

const host = "127.0.0.1";
const requestedPort = e2ePort(process.env.MOLENKOPF_DASHBOARD_E2E_PORT);
let dataDir: string | undefined;
let proxy: Awaited<ReturnType<typeof startProxy>> | undefined;
let server: Awaited<ReturnType<typeof createServer>> | undefined;

try {
  dataDir = await mkdtemp(join(tmpdir(), "molenkopf-dashboard-e2e-"));
  process.env.MOLENKOPF_SESSION_SECRET ??= "test-only-session-secret-please-change-123456";
  proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });
  process.env.MOLENKOPF_DASHBOARD_API_ORIGIN = `http://${host}:${proxy.port}`;
  server = await createServer({
    server: { host, port: requestedPort.port, strictPort: requestedPort.strictPort, hmr: false },
    configFile: "vite.config.ts"
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a local test URL");
  process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = new URL(url).origin;
  process.exitCode = await runCypress(new URL(url).origin);
} finally {
  await server?.close().catch(() => {});
  await proxy?.close().catch(() => {});
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

function runCypress(baseUrl: string): Promise<number> {
  const child = spawn(process.execPath, [
    "node_modules/cypress/bin/cypress",
    "run",
    "--config",
    `baseUrl=${baseUrl}`
  ], { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    let settled = false;
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

function e2ePort(value: string | undefined): { port: number; strictPort: boolean } {
  if (!value) return { port: 0, strictPort: false };
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("MOLENKOPF_DASHBOARD_E2E_PORT must be an integer from 1 to 65535");
  return { port, strictPort: true };
}
