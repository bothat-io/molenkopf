import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { cliArgs } from "./cli-request.ts";
import { cliEnv } from "./cli-env.ts";

export function executeCliProvider(provider: ProviderConfig, prompt: string, runModel?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const baseArgs = cliArgs(provider, runModel);
    const args = provider.cliInputMode === "argument" ? [...baseArgs, prompt] : baseArgs;
    const spec = cliSpawnSpec(provider.cliCommand ?? "claude", args);
    const timeoutMs = provider.cliTimeoutMs ?? 120000;
    const lifecycle = newLifecycle(provider);
    const child = spawn(spec.command, spec.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: cliEnv(provider), detached: process.platform !== "win32" });
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const limits = outputLimits();
    let settled = false, killTimer: NodeJS.Timeout | undefined, stdoutSeen = false, stderrSeen = false;
    const timer = setTimeout(() => {
      lifecycle.add(`timeout ${timeoutMs}ms`);
      terminateProcessTree(child.pid, "SIGTERM", lifecycle);
      killTimer = setTimeout(() => terminateProcessTree(child.pid, "SIGKILL", lifecycle), 250);
      killTimer.unref?.();
      fail(new Error(`local cli provider timed out after ${timeoutMs}ms${detail(lifecycle.items, stdout, stderr)}`), false);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (!stdoutSeen) { stdoutSeen = true; lifecycle.add("stdout first byte"); }
      if (!capture(stdout, Buffer.from(chunk), limits.streamBytes)) overflow("stdout");
    });
    child.stderr.on("data", (chunk) => {
      if (!stderrSeen) { stderrSeen = true; lifecycle.add("stderr first byte"); }
      if (!capture(stderr, Buffer.from(chunk), limits.streamBytes)) overflow("stderr");
    });
    child.on("error", (error) => fail(new Error(`local cli provider failed: ${error.message}${detail(lifecycle.items, stdout, stderr)}`), true));
    child.on("close", (code, signal) => {
      lifecycle.add(`close code=${code ?? "unknown"} signal=${signal ?? "none"}`);
      if (settled) { if (killTimer) clearTimeout(killTimer); return; }
      if (code !== 0) return fail(new Error(exitMessage(code, stdout, stderr, lifecycle.items)), true);
      finish(true);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      if (!output) return reject(new Error(`local cli provider returned empty output${detail(lifecycle.items, stdout, stderr)}`));
      resolve(output);
    });

    lifecycle.add("stdin sent");
    if (provider.cliInputMode !== "argument") child.stdin.end(prompt);
    else child.stdin.end();

    function fail(error: Error, clearKill: boolean): void {
      if (settled) return;
      finish(clearKill);
      reject(error);
    }
    function finish(clearKill: boolean): void {
      settled = true;
      clearTimeout(timer);
      if (clearKill && killTimer) clearTimeout(killTimer);
    }
    function overflow(stream: "stdout" | "stderr"): void {
      lifecycle.add(`${stream} overflow`);
      child.kill("SIGTERM");
      fail(new Error(`local cli provider output exceeded ${limits.streamBytes} bytes${detail(lifecycle.items, stdout, stderr)}`), true);
    }
  });
}

function newLifecycle(provider: ProviderConfig) {
  const started = Date.now();
  const items = [`0ms spawn runtime=${provider.runtime ?? "cli"}`];
  return { items, add: (event: string) => items.push(`${Date.now() - started}ms ${event}`) };
}

function terminateProcessTree(pid: number | undefined, signal: NodeJS.Signals, lifecycle: ReturnType<typeof newLifecycle>): void {
  if (!pid) return void lifecycle.add(`kill ${signal} failed missing pid`);
  if (process.platform === "win32") {
    try {
      const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      taskkill.once("error", () => lifecycle.add(`kill tree ${signal} failed`));
      lifecycle.add(`kill tree ${signal} sent`);
    } catch {
      lifecycle.add(`kill tree ${signal} failed`);
    }
    return;
  }
  try {
    process.kill(-pid, signal);
    lifecycle.add(`kill group ${signal} sent`);
  } catch {
    try {
      process.kill(pid, signal);
      lifecycle.add(`kill ${signal} sent`);
    } catch {
      lifecycle.add(`kill ${signal} failed`);
    }
  }
}

function exitMessage(code: number | null, stdout: Buffer[], stderr: Buffer[], events: string[]): string {
  return `local cli provider exited with ${code ?? "unknown"}${detail(events, stdout, stderr)}`;
}

function detail(events: string[], stdout: Buffer[], stderr: Buffer[]): string {
  const outputClass = cliOutputClass(stdout, stderr);
  return `; lifecycle: ${events.join(" -> ")}${outputClass ? `; output_class:${outputClass}` : ""}`;
}

function cliOutputClass(stdout: Buffer[], stderr: Buffer[]): string {
  if (stdout.some((item) => item.length === 0) || stderr.some((item) => item.length === 0)) return "overflow";
  const raw = [Buffer.concat(stdout).toString("utf8"), Buffer.concat(stderr).toString("utf8")].join("\n");
  if (/requested permissions|haven't granted|permission[^.]{0,80}(denied|blocked|required)|requires permission|not allowed/i.test(raw)) return "permission_prompt";
  if (/not logged in|please run \/login|auth|authentication|credentials/i.test(raw)) return "auth_failure";
  return raw.trim() ? "present" : "";
}

function capture(chunks: Buffer[], chunk: Buffer, limit: number): boolean {
  const used = chunks.reduce((sum, item) => sum + item.length, 0);
  const remaining = limit - used;
  if (remaining <= 0) return false;
  if (chunk.length <= remaining) {
    chunks.push(chunk);
    return true;
  }
  chunks.push(chunk.subarray(0, remaining), Buffer.alloc(0));
  return false;
}

function outputLimits(): { streamBytes: number } {
  const configured = Number(process.env.MOLENKOPF_CLI_OUTPUT_LIMIT_BYTES);
  return { streamBytes: Number.isInteger(configured) && configured > 0 ? configured : 1024 * 1024 };
}

function cliSpawnSpec(command: string, args: string[]): { command: string; args: string[] } {
  const resolved = resolveCliCommand(command);
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(resolved)) return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", resolved, ...args] };
  if (process.platform === "win32" && /\.ps1$/i.test(resolved)) return { command: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved, ...args] };
  return { command: resolved, args };
}

function resolveCliCommand(command: string, env: Record<string, string | undefined> = process.env, platform = process.platform): string {
  if (platform !== "win32" || hasExtension(command)) return command;
  for (const candidate of windowsCandidates(command, env)) if (existsSync(candidate)) return candidate;
  return command;
}

function windowsCandidates(command: string, env: Record<string, string | undefined>): string[] {
  const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  if (isPathLike(command)) return exts.map((ext) => `${command}${ext.toLowerCase()}`);
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  return pathValue.split(";").filter(Boolean).flatMap((dir) => exts.map((ext) => join(dir, `${command}${ext.toLowerCase()}`)));
}

function isPathLike(command: string): boolean {
  return command.includes("/") || command.includes("\\");
}

function hasExtension(command: string): boolean {
  return /\.[^\\/]+$/.test(command);
}
