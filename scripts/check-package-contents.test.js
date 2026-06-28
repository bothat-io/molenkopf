import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageFailures } from "./check-package-contents.js";

test("package checker rejects sensitive tarball entries", async () => {
  const root = await fixtureRoot();
  try {
    const paths = requiredPaths().concat([
      "packages/plugins/context-compressor-plugin/.env",
      "packages/plugins/context-compressor-plugin/auth.json",
      "packages/proxy/src/http/local.db",
      "packages/core/src/security/debug.log"
    ]);
    const failures = packageFailures(manifest(), paths, root);
    assert.ok(failures.some((item) => item.includes(".env")));
    assert.ok(failures.some((item) => item.includes("auth.json")));
    assert.ok(failures.some((item) => item.includes("local.db")));
    assert.ok(failures.some((item) => item.includes("debug.log")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package checker accepts descriptor-v2-derived plugin inventory", async () => {
  const root = await fixtureRoot();
  try {
    const paths = requiredPaths().concat([
      "package.json",
      "bin/launcher.js",
      "packages/core/src/security/secret-redactor.ts",
      "packages/proxy/src/cli/main.ts",
      "packages/dashboard/dist/assets/index.js"
    ]);
    assert.deepEqual(packageFailures(manifest(), paths, root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function manifest() {
  return { files: [
    ".env.example", "bin/", "packages/core/src/", "packages/proxy/src/",
    "packages/plugins/", "packages/dashboard/dist/",
    "packages/dashboard/public/molenkopf-logo.png",
    "packages/dashboard/public/favicon.png", "docs/DEPLOYMENT.md",
    "docs/PLUGIN_DEVELOPMENT.md", "docs/PLUGIN_POLICY.md",
    "docs/MOLENKOPF_USAGE.md", "docs/MOLENKOPF_PLUGIN_API.md",
    "docs/PRODUCT_INTENT.md", "docs/plugins/", "docs/THREAT_MODEL.md",
    "molenkopf.config.example.json", "README.md", "LICENSE", "SECURITY.md"
  ] };
}

function requiredPaths() {
  return [
    ".env.example", "bin/molenkopf.js", "bin/launcher.js",
    "packages/core/src/security/secret-redactor.ts",
    "packages/proxy/src/cli/main.ts",
    "packages/plugins/context-compressor-plugin/descriptor.ts",
    "packages/plugins/context-compressor-plugin/descriptor-v2.ts",
    "packages/plugins/context-compressor-plugin/plugin.ts",
    "packages/plugins/context-compressor-plugin/page.html",
    "packages/plugins/obsidian-graph-plugin/descriptor.ts",
    "packages/plugins/obsidian-graph-plugin/descriptor-v2.ts",
    "packages/plugins/obsidian-graph-plugin/plugin.ts",
    "packages/plugins/obsidian-graph-plugin/page.html",
    "packages/plugins/example-plugin/descriptor-v2.ts",
    "packages/plugins/example-plugin/plugin.ts",
    "packages/plugins/example-plugin/page.html",
    "packages/plugins/project-graph-plugin/descriptor-v2.ts",
    "packages/plugins/project-graph-plugin/plugin.ts",
    "packages/plugins/project-graph-plugin/page.html",
    "packages/plugins/token-optimizer-plugin/descriptor-v2.ts",
    "packages/plugins/token-optimizer-plugin/plugin.ts",
    "packages/plugins/token-optimizer-plugin/page.html",
    "packages/plugins/shared/audit-projects.ts",
    "packages/dashboard/dist/index.html",
    "packages/dashboard/public/molenkopf-logo.png",
    "packages/dashboard/public/favicon.png", "docs/DEPLOYMENT.md",
    "docs/PLUGIN_DEVELOPMENT.md", "docs/PLUGIN_POLICY.md",
    "docs/MOLENKOPF_USAGE.md", "docs/MOLENKOPF_PLUGIN_API.md",
    "docs/PRODUCT_INTENT.md", "docs/plugins/context-compressor-plugin.md",
    "docs/plugins/token-optimizer-plugin.md", "docs/THREAT_MODEL.md",
    "molenkopf.config.example.json", "README.md", "LICENSE", "SECURITY.md"
  ];
}

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "molenkopf-package-check-"));
  for (const path of requiredPaths()) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), path.endsWith("descriptor-v2.ts") ? descriptorStub(path) : "x");
  }
  return root;
}

function descriptorStub(path) {
  const pluginId = path.split("/")[2];
  return [
    `export const descriptorV2 = {`,
    `  id: "${pluginId}",`,
    `  modulePath: "plugin.ts",`,
    `  workspace: { pagePath: "/__molenkopf/plugins/${pluginId}/page" }`,
    `};`
  ].join("\n");
}
