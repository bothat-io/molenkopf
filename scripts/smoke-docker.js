import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.env.MOLENKOPF_DOCKER_IMAGE || "molenkopf:smoke";
const skipBuild = process.env.MOLENKOPF_DOCKER_SKIP_BUILD === "1";
const name = `molenkopf-smoke-${process.pid}`;
const volume = `${name}-data`;
const tmp = mkdtempSync(join(tmpdir(), "molenkopf-docker-smoke-"));
const envFile = join(tmp, ".env");
const host = "127.0.0.1";
const hostPort = smokeHostPort();
const baseUrl = `http://${host}:${hostPort}`;
assertDockerAvailable();
const hostProbe = dockerHost().startsWith("ssh://") ? "docker-host" : "local-host";

writeFileSync(envFile, "MOLENKOPF_SESSION_SECRET=test-8f6e1a9d0c2b4f739ab15c6d8e029471\n");

try {
  if (!skipBuild) run(["build", "--pull", "-t", image, "."]);
  assertFailsWithoutSecret();
  run(["volume", "create", volume]);
  run(["run", "-d", "--name", name, "--env-file", envFile, "-p", `${host}:${hostPort}:8787`, "-v", `${volume}:/data`, image]);
  waitForHealth();
  execNode(smokeScript("first"));
  run(["rm", "-f", name], "ignore");
  run(["run", "-d", "--name", name, "--env-file", envFile, "-p", `${host}:${hostPort}:8787`, "-v", `${volume}:/data`, image]);
  waitForHealth();
  execNode(smokeScript("restart"));
  console.log(`docker smoke ok (${baseUrl}, ${hostProbe})`);
} finally {
  run(["rm", "-f", name], "ignore");
  run(["volume", "rm", volume], "ignore");
  rmSync(tmp, { recursive: true, force: true });
}

function assertFailsWithoutSecret() {
  try {
    execFileSync("docker", ["run", "--rm", image], { cwd: process.cwd(), stdio: "pipe", timeout: 10000 });
    throw new Error("expected container to fail without MOLENKOPF_SESSION_SECRET");
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? error.status : 1;
    const stderr = typeof error === "object" && error && "stderr" in error ? String(error.stderr) : "";
    if (status === 0 || !stderr.includes("MOLENKOPF_SESSION_SECRET is required")) throw error;
  }
}

function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      execHostNode(`fetch(${JSON.stringify(`${baseUrl}/__molenkopf/health`)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`);
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  run(["logs", name], "inherit");
  throw new Error("container did not become healthy");
}

function execNode(script) {
  execHostNode(script, "inherit");
}

function execHostNode(script, stdout = "pipe") {
  if (hostProbe === "docker-host") {
    execFileSync("docker", ["run", "--rm", "--network", "host", image, "node", "--input-type=module", "-"], { input: script, stdio: ["pipe", stdout, "inherit"] });
    return;
  }
  execFileSync(process.execPath, ["--input-type=module", "-"], { input: script, stdio: ["pipe", stdout, "inherit"] });
}

function smokeScript(phase) {
  return `
const base = ${JSON.stringify(baseUrl)};
const get = (path, init) => fetch(new URL(path, base), init);
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const root = await get('/', { redirect: 'manual' });
expect(root.status === 302 && new URL(root.headers.get('location') ?? '', base).pathname === '/__molenkopf/dashboard', 'root redirect failed');
const dashboard = await get('/__molenkopf/dashboard/');
expect(dashboard.status === 200, 'dashboard failed');
const html = await dashboard.text();
expect(html.includes('id="root"'), 'dashboard root missing');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const asset = await get(match[1]);
  expect(asset.status === 200, 'dashboard asset failed: ' + match[1]);
}
const before = await get('/__molenkopf/me').then((r) => r.json());
${phase === "first" ? firstRunChecks() : restartChecks()}
`;
}

function firstRunChecks() {
  return `
expect(before.needsSetup === true, 'expected first-run setup');
expect((await get('/__molenkopf/plugins')).status === 401, 'plugins should require auth before setup');
const setup = await get('/__molenkopf/setup-admin', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: 'admin', password: 'admin-secret' })
});
expect(setup.status === 200, 'setup failed: ' + setup.status);
const cookie = setup.headers.get('set-cookie')?.split(';')[0] ?? '';
const after = await get('/__molenkopf/me', { headers: { cookie } }).then((r) => r.json());
expect(after.user?.id === 'admin', 'authenticated setup session missing');
expect((await get('/__molenkopf/setup-admin', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' })).status === 403, 'second setup should fail');
const plugins = await get('/__molenkopf/plugins', { headers: { cookie } }).then((r) => r.json());
const ids = (plugins.items || []).map((item) => item.id).sort();
expect(ids.includes('context-compressor-plugin'), 'missing context-compressor-plugin');
expect(ids.includes('project-graph-plugin'), 'missing project-graph-plugin');
expect(ids.includes('token-optimizer-plugin'), 'missing token-optimizer-plugin');
for (const plugin of plugins.items) {
  const page = await get(plugin.pagePath, { headers: { cookie } });
  expect(page.status === 200, 'plugin page failed: ' + plugin.id);
}
`;
}

function restartChecks() {
  return `
expect(before.needsSetup !== true, 'restart lost admin state');
const login = await get('/__molenkopf/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ username: 'admin', password: 'admin-secret' })
});
expect(login.status === 200, 'login after restart failed: ' + login.status);
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
const after = await get('/__molenkopf/me', { headers: { cookie } }).then((r) => r.json());
expect(after.user?.id === 'admin', 'restart session missing');
`;
}

function run(args, stdio = "pipe") {
  try {
    return execFileSync("docker", args, { cwd: process.cwd(), stdio });
  } catch (error) {
    if (stdio === "ignore") return Buffer.alloc(0);
    throw error;
  }
}

function assertDockerAvailable() {
  try {
    execFileSync("docker", ["version"], { stdio: "ignore" });
  } catch {
    console.error("Docker is required for smoke:docker. Install Docker or set up Docker before running this smoke test.");
    process.exit(1);
  }
}

function smokeHostPort() {
  const port = process.env.MOLENKOPF_DOCKER_HOST_PORT || "8787";
  const value = Number(port);
  if (!/^[1-9][0-9]{1,4}$/.test(port) || value > 65535) throw new Error("invalid MOLENKOPF_DOCKER_HOST_PORT");
  return port;
}

function dockerHost() {
  try {
    return JSON.parse(execFileSync("docker", ["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], { encoding: "utf8" }).trim()) || "";
  } catch {
    return "";
  }
}
