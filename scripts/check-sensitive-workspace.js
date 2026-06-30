import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const allowedEnvFiles = new Set([".env.example"]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = sensitiveWorkspaceFailures(process.cwd());
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("sensitive workspace check ok");
}

export function sensitiveWorkspaceFailures(root = process.cwd()) {
  const failures = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if ((entry.name === ".env" || (entry.name.startsWith(".env.") && !allowedEnvFiles.has(entry.name))) && !gitIgnored(root, entry.name)) {
      failures.push(`forbidden environment file in workspace root: ${entry.name}`);
    }
  }
  return failures;
}

function gitIgnored(root, name) {
  try {
    execFileSync("git", ["-C", root, "check-ignore", "-q", "--", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
