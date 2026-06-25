import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { startProxy } from "../../proxy/src/http/server.ts";

const host = "127.0.0.1";
const fixedPort = process.env.MOLENKOPF_DASHBOARD_E2E_PORT;
const port = fixedPort ? Number(fixedPort) : 0;
const dataDir = await mkdtemp(join(tmpdir(), "molenkopf-dashboard-e2e-"));
const proxy = await startProxy({ port: 0, target: "http://127.0.0.1:9/v1", dataDir });

process.env.MOLENKOPF_DASHBOARD_API_ORIGIN = `http://${host}:${proxy.port}`;

const server = await createServer({
  server: { host, port, strictPort: Boolean(fixedPort), hmr: false },
  configFile: "vite.config.ts"
});

try {
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error("Vite did not report a local test URL");
  process.env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = new URL(url).origin;
  process.exitCode = await runCypress(new URL(url).origin);
} finally {
  await server.close();
  await proxy.close();
  await rm(dataDir, { recursive: true, force: true });
}

function runCypress(baseUrl: string): Promise<number> {
  const child = spawn(process.execPath, [
    "node_modules/cypress/bin/cypress",
    "run",
    "--config",
    `baseUrl=${baseUrl}`
  ], { stdio: "inherit" });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}
