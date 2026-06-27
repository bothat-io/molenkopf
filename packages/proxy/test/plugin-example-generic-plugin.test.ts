import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { startProxy } from "../src/http/server.ts";
import { builtinPluginDescriptorsV2 } from "../../core/src/plugins/builtin-plugin-descriptors-v2.ts";
import { builtinPluginModules } from "../../core/src/plugins/builtin-plugin-modules.ts";
import { pluginCatalog } from "../../core/src/plugins/plugin-catalog.ts";
import { descriptorV2 as exampleDescriptor } from "../../plugins/example-plugin/descriptor-v2.ts";
import { plugin as examplePlugin } from "../../plugins/example-plugin/plugin.ts";

test("example plugin fixture works through generic registry, page, data, and action paths", async () => {
  const restore = registerExamplePlugin();
  const upstream = createServer((req, res) => { req.resume(); res.writeHead(200, {}); res.end("{}"); });
  const port = await listenOn(upstream);
  let proxy;
  try {
    proxy = await startProxy({ port: 0, target: `http://127.0.0.1:${port}/v1` });
    const base = `http://127.0.0.1:${proxy.port}`;
    const setup = await post(base, "/__molenkopf/setup-admin", { username: "admin", password: "admin-secret" });
    assert.equal(setup.status, 200);
    const login = await post(base, "/__molenkopf/login", { username: "admin", password: "admin-secret" });
    assert.equal(login.status, 200);
    const admin = cookieOf(login);

    const pluginsResponse = await fetch(`${base}/__molenkopf/plugins`, { headers: { cookie: admin } });
    assert.equal(pluginsResponse.status, 200);
    const plugins = await pluginsResponse.json() as { items?: Array<{ id: string }> };
    assert.ok(Array.isArray(plugins.items), JSON.stringify(plugins));
    assert.ok(plugins.items.some((item) => item.id === "example-plugin"));

    const page = await fetch(`${base}/__molenkopf/plugins/example-plugin/page`, { headers: { cookie: admin } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Example Plugin/);

    const data = await fetch(`${base}/__molenkopf/plugins/example-plugin/data`, { headers: { cookie: admin } }).then((res) => res.json());
    assert.equal(data.plugin.id, "example-plugin");
    assert.equal(data.requestCount, 0);

    const action = await post(base, "/__molenkopf/plugins/example-plugin/actions/echo", { input: { message: "hello fixture" } }, admin);
    assert.equal(action.status, 200);
    assert.deepEqual(await action.json(), { echoed: "hello fixture" });

    const effective = await fetch(`${base}/__molenkopf/plugin-policies/effective/everyone/example-plugin`, { headers: { cookie: admin } }).then((res) => res.json());
    assert.equal(effective.pluginId, "example-plugin");
    assert.equal(effective.policy.enabled, true);
    assert.ok(effective.policy.actions.includes("echo"));
  } finally {
    if (proxy) await proxy.close();
    upstream.close();
    restore();
  }
});

function registerExamplePlugin() {
  const descriptors = builtinPluginDescriptorsV2 as unknown as any[];
  const modules = builtinPluginModules as Record<string, unknown>;
  const catalog = pluginCatalog as unknown as any[];
  descriptors.push(exampleDescriptor);
  modules[exampleDescriptor.id] = examplePlugin;
  catalog.push({
    id: exampleDescriptor.id,
    name: exampleDescriptor.name,
    type: "observer",
    category: exampleDescriptor.category,
    description: "Example plugin fixture for generic platform tests.",
    traffic: { reads: ["metadata", "audit"], mutates: ["none"] },
    enabledByDefault: true,
    canToggle: true,
    permissions: ["audit:read"],
    hooks: ["workspace:local-page"],
    modulePath: exampleDescriptor.modulePath,
    pagePath: exampleDescriptor.workspace?.pagePath,
    dataPath: exampleDescriptor.workspace?.dataPath,
    dataScopes: [...(exampleDescriptor.dataScopes ?? [])]
  });
  return () => {
    delete modules[exampleDescriptor.id];
    const descriptorIndex = descriptors.findIndex((item) => item.id === exampleDescriptor.id);
    if (descriptorIndex >= 0) descriptors.splice(descriptorIndex, 1);
    const catalogIndex = catalog.findIndex((item) => item.id === exampleDescriptor.id);
    if (catalogIndex >= 0) catalog.splice(catalogIndex, 1);
  };
}

async function listenOn(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return typeof address === "object" && address ? address.port : 0;
}

function post(base: string, path: string, body: unknown, cookie = "") {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}

function cookieOf(response: Response) {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}
