import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { builtinPluginDescriptorsV2 } from "../src/plugins/builtin-plugin-descriptors-v2.ts";
import { validatePluginDescriptorV2 } from "../src/plugins/plugin-descriptor-v2.ts";

test("built-in plugin descriptors are real v2 descriptors with declared files present", () => {
  for (const descriptor of builtinPluginDescriptorsV2) {
    const validation = validatePluginDescriptorV2(descriptor);
    assert.equal(validation.ok, true, `${descriptor.id} invalid: ${validation.errors.join(",")}`);
    const pluginDir = `packages/plugins/${descriptor.id}`;
    assert.equal(existsSync(`${pluginDir}/descriptor-v2.ts`), true, `${descriptor.id} v2 descriptor exists`);
    assert.equal(existsSync(`${pluginDir}/${descriptor.modulePath}`), true, `${descriptor.id} module exists`);
    if (descriptor.workspace?.pagePath) assert.equal(existsSync(`${pluginDir}/page.html`), true, `${descriptor.id} page exists`);
  }
  assert.equal(builtinPluginDescriptorsV2.some((item) => item.id === "project-graph-plugin"), true);
});
