import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { compressContext } from "../../../core/src/compression/context-compressor.ts";
import { AuditStore } from "../../../core/src/manifest/audit-store.ts";
import { RetrievalStore } from "../../../core/src/store/retrieval-store.ts";
import { startProxy } from "../http/server.ts";
import { parseArgs, type CliArgs } from "./args.ts";
import { loadProxyConfig } from "./config-loader.ts";
import { loadEnvFile } from "./env-file.ts";
import { resolveCliTarget } from "./target.ts";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "--help" || args.command === "help" || args.flags.has("help")) return usage(0);
  if (args.command === "proxy") return proxy(args);
  if (args.command === "compress-file") return compressFile(args);
  if (args.command === "retrieve") return retrieve(args);
  if (args.command === "inspect") return inspect(args);
  if (args.command === "self-test") return selfTest();
  usage(1);
}

async function proxy(args: CliArgs) {
  const envFile = args.flags.get("env-file");
  if (typeof envFile === "string") await loadEnvFile(envFile);
  const loaded = await loadProxyConfig(args.flags);
  const config = loaded.config;
  const explicitConfig = loaded.source === "file" && Boolean(config);
  const target = targetValue(args.flags, config?.target);
  const port = Number(args.flags.get("port") ?? config?.server.port ?? 8787);
  const host = String(args.flags.get("host") ?? config?.server.bindHost ?? "127.0.0.1");
  const allowPublicBind = args.flags.has("allow-public-bind") || config?.server.allowPublicBind === true;
  const dataDir = stringFlag(args.flags, "data-dir") ?? config?.server.dataDir;
  if (host !== "127.0.0.1" && allowPublicBind) console.warn("warning: public bind enabled");
  let running: Awaited<ReturnType<typeof startProxy>>;
  try {
    running = await startProxy({
      target,
      port,
      host,
      allowPublicBind,
      dataDir,
      providers: config?.providers,
      activeProviderId: config?.activeProviderId,
      configAgents: config?.agents,
      providerCatalogMode: explicitConfig ? "explicit" : "auto",
      configSource: { kind: loaded.source, path: displayConfigPath(loaded.configPath) }
    });
  } catch (error) {
    if (isAddressInUse(error) && await isMolenkopfRunning(host, port)) {
      console.log(`Molenkopf proxy already running on http://${host}:${port}`);
      console.log(`Dashboard: http://${host}:${port}/__molenkopf/dashboard`);
      return;
    }
    if (isAddressInUse(error)) throw new Error(`port already in use: ${host}:${port}; stop that process or pass --port <free-port>`);
    throw error;
  }
  console.log(`Molenkopf proxy listening on http://${host}:${running.port}`);
}

async function compressFile(args: CliArgs) {
  const file = args.values[0];
  if (!file) throw new Error("compress-file requires a file path");
  const text = await readFile(file, "utf8");
  const store = new RetrievalStore();
  const result = await compressContext(text, store);
  console.log(result.text);
  if (result.retrievalId) console.log(`\nretrieve: ${result.retrievalId}`);
}

async function retrieve(args: CliArgs) {
  const id = args.values[0];
  if (!id) throw new Error("retrieve requires a retrieval id");
  console.log(await new RetrievalStore().retrieve(id));
}

async function inspect(args: CliArgs) {
  if (!args.flags.has("last")) throw new Error("inspect currently supports --last");
  const latest = await new AuditStore().latest();
  console.log(JSON.stringify(latest ?? {}, null, 2));
}

async function selfTest() {
  const sample = Array.from({ length: 260 }, (_, i) => `line ${i}`).join("\n") + "\nERROR sample";
  const result = await compressContext(sample, new RetrievalStore());
  if (!result.compressed || !result.retrievalId) throw new Error("compression self-test failed");
  const original = await new RetrievalStore().retrieve(result.retrievalId);
  if (!original.includes("Context excerpt only") || !original.includes("TRUNCATED_CONTEXT")) throw new Error("retrieval self-test failed");
  if (original.includes("ERROR sample")) throw new Error("retrieval self-test persisted a raw tail");
  console.log("self-test ok");
}

function usage(code: number): never {
  console.error("usage: proxy [--env-file FILE] [--config FILE]|compress-file|retrieve|inspect|self-test");
  process.exit(code);
}

function targetValue(flags: Map<string, string | boolean>, configTarget?: string): string {
  const explicit = stringFlag(flags, "target");
  return explicit ?? configTarget ?? resolveCliTarget(flags);
}

function stringFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" && value ? value : undefined;
}

function displayConfigPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") && !rel.includes(":") ? rel : path;
}

function isAddressInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
}

async function isMolenkopfRunning(host: string, port: number): Promise<boolean> {
  const healthHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  try {
    const response = await fetch(`http://${healthHost}:${port}/__molenkopf/health`, { signal: AbortSignal.timeout(800) });
    return response.ok && (await response.json()).ok === true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
