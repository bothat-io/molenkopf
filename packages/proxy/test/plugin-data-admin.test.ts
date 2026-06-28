import test from "node:test";
import assert from "node:assert/strict";
import { postAuth, getAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("admin plugin data includes cross-team aggregated plugin data", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-data-admin-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "beta", name: "Beta" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", role: "member", teamIds: ["alpha"] }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", { id: "ana", displayName: "Ana", role: "member", teamIds: ["beta"] }, admin);
    const bobKey = await postAuth(env.base, "/__molenkopf/keys", { owner: "bob", project: "project-one", teamId: "alpha" }, admin).then((res) => res.json());
    const anaKey = await postAuth(env.base, "/__molenkopf/keys", { owner: "ana", project: "project-two", teamId: "beta" }, admin).then((res) => res.json());
    await fetch(`${env.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bobKey.secret}` }, body: "{}" });
    await fetch(`${env.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${anaKey.secret}` }, body: "{}" });

    const response = await getAuth(env.base, "/__molenkopf/plugins/context-compressor-plugin/data", admin);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.metrics.projects.some((item: { id: string }) => item.id === "project-one"), true);
    assert.equal(payload.metrics.projects.some((item: { id: string }) => item.id === "project-two"), true);
  } finally {
    await env.close();
  }
});
