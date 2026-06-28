import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPackage = "@bothat-io/molenkopf";

export function parsePublishArgs(argv, fallbackVersion) {
  const options = { tag: "", dryRun: false, skipGithubCheck: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--skip-github-check") options.skipGithubCheck = true;
    else if (arg === "--tag") options.tag = argv[++i] ?? "";
    else if (arg.startsWith("--tag=")) options.tag = arg.slice("--tag=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  const tag = options.tag || `v${fallbackVersion}`;
  const version = versionFromTag(tag);
  if (!version) throw new Error(`expected SemVer tag like v0.1.2, got ${tag || "empty"}`);
  return { ...options, tag, version };
}

export function publishPackageFailures(pkg, tag) {
  const version = versionFromTag(tag);
  const failures = [];
  if (pkg.name !== expectedPackage) failures.push(`package name must be ${expectedPackage}`);
  if (pkg.private !== false) failures.push("package.json private must be false");
  if (pkg.publishConfig?.access !== "public") failures.push("publishConfig.access must be public");
  if (pkg.version !== version) failures.push(`package version must match ${tag}`);
  return failures;
}

export function releaseRunSucceeded(runs, tag, sha) {
  return runs.some((run) => run.name === "release" &&
    run.event === "push" &&
    run.head_branch === tag &&
    run.head_sha === sha &&
    run.status === "completed" &&
    run.conclusion === "success");
}

export function repoFullName(remoteUrl) {
  const match = remoteUrl.trim().match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+)(?:\.git)?$/i);
  if (!match?.groups) throw new Error(`cannot infer GitHub repo from origin URL: ${remoteUrl}`);
  return `${match.groups.owner}/${match.groups.repo}`;
}

export function npmPublishArgs(dryRun = false) {
  return ["publish", "--access", "public", ...(dryRun ? ["--dry-run"] : [])];
}

export function localMainSyncFailures(state) {
  const failures = [];
  if (!state.localMain) failures.push("local main branch is missing");
  if (!state.originMain) failures.push("origin/main is missing; run git fetch origin main --tags");
  if (state.localMain && state.originMain && state.localMain !== state.originMain) {
    failures.push("local main must match origin/main before npm publish; sync it after preserving any local work");
  }
  return failures;
}

async function main() {
  const currentPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const options = parsePublishArgs(process.argv.slice(2), currentPkg.version);
  run("git", ["fetch", "origin", "main", "--tags"], root, "inherit");
  const tagSha = output("git", ["rev-parse", `${options.tag}^{commit}`], root).trim();
  const tagPkg = JSON.parse(output("git", ["show", `${options.tag}:package.json`], root));
  const failures = [...publishPackageFailures(tagPkg, options.tag), ...localMainSyncFailures(gitMainState())];
  if (!isAncestor(tagSha, "origin/main")) failures.push(`${options.tag} must point to a commit contained in origin/main`);
  if (await npmVersionExists(tagPkg.name, options.version)) failures.push(`${tagPkg.name}@${options.version} is already published`);
  if (!options.skipGithubCheck) await requireSuccessfulReleaseRun(options.tag, tagSha);
  checkNpmLogin(failures);
  if (failures.length) fail(failures);
  publishFromCleanWorktree(options.tag, options.dryRun);
}

async function requireSuccessfulReleaseRun(tag, sha) {
  const repo = repoFullName(output("git", ["remote", "get-url", "origin"], root));
  const url = `https://api.github.com/repos/${repo}/actions/runs?event=push&head_sha=${sha}&per_page=30`;
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "molenkopf-release-npm-publish" } });
  if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`);
  const body = await response.json();
  if (!releaseRunSucceeded(body.workflow_runs ?? [], tag, sha)) throw new Error(`no successful release workflow found for ${tag} at ${sha}`);
}

function publishFromCleanWorktree(tag, dryRun) {
  const dir = mkdtempSync(join(tmpdir(), "molenkopf-npm-publish-"));
  try {
    run("git", ["worktree", "add", "--detach", dir, tag], root, "inherit");
    runNpm(["ci"], dir, "inherit");
    runNpm(["--prefix", "packages/dashboard", "ci"], dir, "inherit");
    runNpm(["run", "prepack"], dir, "inherit");
    runNpm(["pack", "--dry-run"], dir, "inherit");
    console.log(`Publishing ${tag} to npm${dryRun ? " as a dry run" : ""}. npm may ask for OTP or login confirmation.`);
    runNpm(npmPublishArgs(dryRun), dir, "inherit");
  } finally {
    try { run("git", ["worktree", "remove", "--force", dir], root, "ignore"); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

function checkNpmLogin(failures) {
  try {
    const user = runNpm(["whoami"], root, "pipe").trim();
    console.log(`npm user: ${user}`);
  } catch {
    failures.push("npm login required: run npm login, then retry");
  }
}

async function npmVersionExists(name, version) {
  try {
    runNpm(["view", `${name}@${version}`, "version"], root, "pipe");
    return true;
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/E404|404 Not Found/i.test(text)) return false;
    throw error;
  }
}

function isAncestor(sha, ref) {
  try {
    run("git", ["merge-base", "--is-ancestor", sha, ref], root, "pipe");
    return true;
  } catch {
    return false;
  }
}

function gitMainState() {
  return {
    localMain: maybeOutput("git", ["rev-parse", "main"], root).trim(),
    originMain: maybeOutput("git", ["rev-parse", "origin/main"], root).trim()
  };
}

function maybeOutput(command, args, cwd) {
  try {
    return output(command, args, cwd);
  } catch {
    return "";
  }
}

function versionFromTag(tag) {
  const match = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(tag);
  return match?.[1];
}

function fail(failures) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

function output(command, args, cwd) {
  return run(command, args, cwd, "pipe");
}

function run(command, args, cwd, stdio) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio });
}

function runNpm(args, cwd, stdio) {
  const npmCli = process.env.npm_execpath;
  if (npmCli) return execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: "utf8", stdio });
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  return execFileSync(executable, args, { cwd, encoding: "utf8", stdio, shell: process.platform === "win32" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
