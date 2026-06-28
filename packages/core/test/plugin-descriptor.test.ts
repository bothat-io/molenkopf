import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { builtinPluginDescriptors } from "../src/plugins/plugin-descriptor.ts";
import { pluginCatalog } from "../src/plugins/plugin-catalog.ts";
import { staticPluginPipeline } from "../src/plugins/static-pipeline.ts";

const optionalPluginIds = ["context-compressor-plugin", "obsidian-graph-plugin", "project-graph-plugin", "token-optimizer-plugin"];

test("builtin plugin descriptors are unique and expose explicit runtime contracts", () => {
  const ids = builtinPluginDescriptors.map((plugin) => plugin.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(pluginCatalog.filter((plugin) => plugin.pipelineIndex !== undefined).map((plugin) => plugin.id), [...staticPluginPipeline]);
  assert.equal(pluginCatalog.every((plugin) => plugin.permissions.length > 0), true);
  assert.equal(pluginCatalog.every((plugin) => plugin.hooks.length > 0), true);
  assert.equal(pluginCatalog.every((plugin) => plugin.type && plugin.traffic.reads.length > 0 && plugin.traffic.mutates.length > 0), true);
  assert.deepEqual(pluginCatalog.map((plugin) => plugin.id).sort(), optionalPluginIds);
});

test("descriptor registry does not import executable plugin modules", () => {
  const descriptorRegistry = readFileSync("packages/core/src/plugins/builtin-plugin-descriptors.ts", "utf8");
  const pluginDescriptor = readFileSync("packages/core/src/plugins/plugin-descriptor.ts", "utf8");
  assert.doesNotMatch(descriptorRegistry, /\/plugin\.ts/);
  assert.doesNotMatch(pluginDescriptor, /builtin-plugin-modules/);
});

test("plugin modules live in plugin folders", () => {
  for (const plugin of pluginCatalog) {
    assert.equal(plugin.modulePath, "plugin.ts", `${plugin.id} must point at its runtime module`);
    assert.equal(existsSync(join("packages", "plugins", plugin.id, plugin.modulePath)), true, `${plugin.id} has no plugin.ts`);
  }
});

test("old json descriptor files are absent", () => {
  const removedDescriptorFile = ["plugin", "json"].join(".");
  for (const plugin of builtinPluginDescriptors) {
    assert.equal(existsSync(join("packages", "plugins", plugin.id, removedDescriptorFile)), false, `${plugin.id} still has an old json descriptor`);
  }
});

test("plugin traffic contracts model optional plugin mutation rights explicitly", () => {
  const byId = new Map(pluginCatalog.map((plugin) => [plugin.id, plugin]));
  assert.equal(byId.get("context-compressor-plugin")?.type, "transformer");
  assert.deepEqual(byId.get("context-compressor-plugin")?.traffic.mutates, ["transform"]);
  assert.deepEqual(byId.get("obsidian-graph-plugin")?.traffic.mutates, ["none"]);
  assert.deepEqual(byId.get("project-graph-plugin")?.traffic.mutates, ["none"]);
  assert.deepEqual(byId.get("token-optimizer-plugin")?.traffic.mutates, ["none"]);
});

test("registered plugins are optional and toggleable", () => {
  const byId = new Map(pluginCatalog.map((plugin) => [plugin.id, plugin]));
  assert.deepEqual(pluginCatalog.filter((plugin) => plugin.canToggle).map((plugin) => plugin.id).sort(), optionalPluginIds);
  assert.equal(byId.get("context-compressor-plugin")?.canToggle, true);
  assert.equal(byId.get("obsidian-graph-plugin")?.canToggle, true);
  assert.equal(byId.get("project-graph-plugin")?.canToggle, true);
  assert.equal(byId.get("token-optimizer-plugin")?.canToggle, true);
  assert.equal(pluginCatalog.every((plugin) => plugin.canToggle), true);
});

test("hooks and permissions stay compatible", () => {
  for (const plugin of pluginCatalog) {
    if (plugin.hooks.includes("request:body:rewrite")) assert.ok(plugin.permissions.includes("body:read") || plugin.permissions.includes("body:write"), `${plugin.id} body hook needs body permission`);
    if (plugin.hooks.includes("audit:manifest")) assert.ok(plugin.permissions.includes("audit:write"), `${plugin.id} audit hook needs audit write`);
    if (plugin.hooks.includes("events:lifecycle")) assert.ok(plugin.permissions.includes("events:write"), `${plugin.id} events hook needs events write`);
    if (plugin.hooks.includes("provider:route")) assert.ok(plugin.permissions.includes("metadata:read"), `${plugin.id} route hook needs metadata read`);
    if (plugin.hooks.includes("workspace:local-page")) assert.ok(plugin.pagePath?.endsWith("/page") && plugin.dataPath?.endsWith("/data") && (plugin.dataScopes ?? []).length > 0, `${plugin.id} workspace hook needs page and data`);
    if (plugin.permissions.includes("body:write")) assert.ok(plugin.hooks.includes("request:body:rewrite"), `${plugin.id} body write needs request body hook`);
  }
});

test("plugin workspaces publish paired page and data paths", () => {
  const workspaces = pluginCatalog.filter((plugin) => plugin.pagePath || plugin.dataPath);
  assert.deepEqual(workspaces.map((plugin) => plugin.id).sort(), optionalPluginIds);
  assert.equal(workspaces.every((plugin) => plugin.pagePath?.endsWith("/page") && plugin.dataPath?.endsWith("/data")), true);
  assert.equal(workspaces.every((plugin) => (plugin.dataScopes ?? []).length > 0), true);
});
