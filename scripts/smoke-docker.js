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

writeFileSync(envFile, "MOLENKOPF_SESSION_SECRET=test-only-session-secret-please-change-123456\n");

try {
  if (!skipBuild) run(["build", "--pull", "-t", image, "."]);
  assertFailsWithoutSecret();
  run(["volume", "create", volume]);
  run(["run", "-d", "--name", name, "--env-file", envFile, "-v", `${volume}:/data`, image]);
  waitForHealth();
  execNode(smokeScript("first"));
  run(["rm", "-f", name], "ignore");
  run(["run", "-d", "--name", name, "--env-file", envFile, "-v", `${volume}:/data`, image]);
  waitForHealth();
  execNode(smokeScript("restart"));
  console.log("docker smoke ok");
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
      execFileSync("docker", ["exec", name, "node", "-e", "fetch('http://127.0.0.1:8787/__molenkopf/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], { stdio: "pipe" });
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  run(["logs", name], "inherit");
  throw new Error("container did not become healthy");
}

function execNode(script) {
  execFileSync("docker", ["exec", "-i", name, "node", "--input-type=module", "-"], { input: script, stdio: ["pipe", "inherit", "inherit"] });
}

function smokeScript(phase) {
  return `
const base = 'http://127.0.0.1:8787';
const get = (path, init) => fetch(base + path, init);
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const root = await get('/', { redirect: 'manual' });
expect(root.status === 302 && root.headers.get('location') === '/__molenkopf/dashboard', 'root redirect failed');
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
expect(plugins.items?.length === 2, 'expected plugin list');
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
  return execFileSync("docker", args, { cwd: process.cwd(), stdio });
}
