import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const tracked = gitLsFiles();
const handwritten = tracked.filter((file) => /\.(js|ts|tsx|md|json|yml|yaml)$/.test(file) && !generated(file));
const failures = [];

for (const file of handwritten) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/).length;
  if (lines > 200) failures.push(`${file}: ${lines} lines`);
}

if (failures.length) {
  console.error("handwritten file line limit exceeded");
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("line limits ok");

function generated(file) {
  return file === "FIXME.md" || file.endsWith("package-lock.json") || file.startsWith("docs/MOLENKOPF_EXECUTION_PACKAGES") || file.includes("/dist/");
}

function gitLsFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  } catch (error) {
    const message = `${error.stderr ?? ""}${error.message ?? ""}`;
    if (!message.includes("dubious ownership")) throw error;
    return execFileSync("git", ["-c", `safe.directory=${process.cwd()}`, "ls-files"], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  }
}
