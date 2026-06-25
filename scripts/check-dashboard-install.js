import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "packages/dashboard/node_modules/react",
  "packages/dashboard/node_modules/vite",
  "packages/dashboard/node_modules/vitest"
];

const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length) {
  console.error("Dashboard dependencies are missing. Run `npm run bootstrap` from a clean checkout before `npm test`.");
  for (const path of missing) console.error(`missing: ${path}`);
  process.exit(1);
}
