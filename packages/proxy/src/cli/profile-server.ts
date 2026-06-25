import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ensurePrivateDirSync } from "../../../core/src/storage/private-state.ts";
import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";

const WATCH_DIRS = ["packages/core/src", "packages/proxy/src"];
const RESTART_DEBOUNCE_MS = 250;
const FORCE_KILL_MS = 1500;
const DASHBOARD_DEV_PORT = 5173;

const PROFILE_DEFAULTS = {
  dev: { port: 8787, dataDir: ".molenkopf/dev" },
  test: { port: 8798, dataDir: ".molenkopf/test" },
  prod: { port: 8787, dataDir: ".molenkopf/prod" }
};

type ProfileName = keyof typeof PROFILE_DEFAULTS;
type Profile = { name: ProfileName; port: number; host: string; target: string; dataDir: string };

export function resolveProfile(name: string, env: Record<string, string | undefined> = process.env): Profile {
  if (!isProfileName(name)) throw new Error("profile must be one of: dev, test, prod");
  const upper = name.toUpperCase();
  const base = PROFILE_DEFAULTS[name];
  const port = parsePort(env[`MOLENKOPF_${upper}_PORT`] || String(base.port));
  const dataDir = env[`MOLENKOPF_${upper}_DATA_DIR`] || base.dataDir;
  const target = env[`MOLENKOPF_${upper}_TARGET`] || env.MOLENKOPF_TARGET || "https://api.openai.com/v1";
  const host = env[`MOLENKOPF_${upper}_HOST`] || "127.0.0.1";
  validateHost(host);
  validateTarget(target);
  if (!dataDir.trim()) throw new Error("dataDir must not be empty");
  return { name, port, host, target, dataDir: resolve(dataDir) };
}

export function proxyArgs(profile: Profile) {
  return [
    "--experimental-strip-types", "--experimental-sqlite", "--disable-warning=ExperimentalWarning",
    "packages/proxy/src/cli/main.ts", "proxy",
    "--target", profile.target, "--host", profile.host,
    "--port", String(profile.port), "--data-dir", profile.dataDir
  ];
}

export function devWatchEnabled(profile: Profile, env: Record<string, string | undefined> = process.env) {
  return profile.name === "dev" && env.MOLENKOPF_DEV_WATCH !== "0";
}

function spawnProxy(profile: Profile, revision?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLENKOPF_PROFILE: profile.name };
  if (revision) env.MOLENKOPF_DEV_REVISION = revision;
  if (profile.name === "dev" && dashboardDevEnabled()) env.MOLENKOPF_DASHBOARD_DEV_ORIGIN = dashboardDevOrigin(env);
  return spawnLogged(process.execPath, proxyArgs(profile), { env });
}

function run() {
  const profile = resolveProfile(process.argv[2] || "dev");
  ensurePrivateDirSync(profile.dataDir);
  console.log(`Molenkopf ${profile.name}: http://${profile.host}:${profile.port}`);
  console.log(`data-dir: ${profile.dataDir}`);
  if (devWatchEnabled(profile)) return runWatched(profile);
  const child = spawnProxy(profile);
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

function runWatched(profile: Profile) {
  const watchers: ReturnType<typeof watch>[] = [];
  let child: ReturnType<typeof spawnProxy>;
  const dashboard = dashboardDevEnabled() ? spawnDashboardDev() : undefined;
  let revision = String(Date.now());
  let restartTimer: ReturnType<typeof setTimeout>;
  let restarting = false;

  const startChild = () => {
    console.log(`dev-revision: ${revision}`);
    child = spawnProxy(profile, revision);
    child.on("exit", (code, signal) => {
      if (restarting) { restarting = false; startChild(); return; }
      closeWatchers(watchers);
      process.exit(code ?? (signal ? 1 : 0));
    });
  };

  const scheduleRestart = (reason: string) => {
    if (restarting) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      revision = String(Date.now());
      console.log(`Dev change: ${reason}; restarting Molenkopf...`);
      restarting = true;
      let exited = false;
      child.once("exit", () => { exited = true; });
      child.kill();
      const forceKill = setTimeout(() => { if (!exited) child.kill("SIGKILL"); }, FORCE_KILL_MS);
      forceKill.unref?.();
    }, RESTART_DEBOUNCE_MS);
  };

  startChild();
  for (const dir of WATCH_DIRS) {
    try {
      const root = resolve(dir);
      watchers.push(watch(root, { recursive: true }, (_event, file) => scheduleRestart(file ? join(dir, String(file)) : dir)));
    } catch (error) {
      console.warn(`Dev watch disabled for ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const stop = (code: number) => {
    closeWatchers(watchers);
    child.kill();
    if (dashboard) dashboard.kill();
    process.exit(code);
  };
  process.on("SIGINT", () => stop(130));
  process.on("SIGTERM", () => stop(143));
}

function dashboardDevEnabled(env = process.env) {
  return env.MOLENKOPF_DASHBOARD_DEV !== "0";
}

function dashboardDevOrigin(env = process.env) {
  const port = Number(env.MOLENKOPF_DASHBOARD_DEV_PORT || DASHBOARD_DEV_PORT);
  return `http://127.0.0.1:${port}`;
}

function spawnDashboardDev() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm --prefix packages/dashboard run dev"] : ["--prefix", "packages/dashboard", "run", "dev"];
  const profile = resolveProfile(process.argv[2] || "dev");
  return spawnLogged(command, args, {
    env: {
      ...process.env,
      MOLENKOPF_DASHBOARD_DEV_PORT: String(Number(process.env.MOLENKOPF_DASHBOARD_DEV_PORT || DASHBOARD_DEV_PORT)),
      MOLENKOPF_DASHBOARD_API_ORIGIN: `http://${profile.host}:${profile.port}`
    }
  });
}

function closeWatchers(watchers: ReturnType<typeof watch>[]) {
  for (const watcher of watchers) watcher.close();
}

function spawnLogged(command: string, args: string[], options: { env: NodeJS.ProcessEnv }) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  return child;
}

function isProfileName(name: string): name is ProfileName {
  return name === "dev" || name === "test" || name === "prod";
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("invalid profile port");
  return port;
}

function validateHost(value: string): void {
  if (!value.trim() || /[/:?#]/.test(value)) throw new Error("invalid profile host");
}

function validateTarget(value: string): void {
  try {
    validateProviderTarget(value, { path: "profile target", allowPrivate: true });
  } catch {
    throw new Error("invalid profile target");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
