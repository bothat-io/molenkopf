import test from "node:test";
import assert from "node:assert/strict";
import { cookieFrom, post, postAuth, putAuth, getAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("member plugin data is scoped to the member team traffic", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-data-member-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "beta", name: "Beta" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", password: "bob-secret", role: "member", teamIds: ["alpha"] }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", { id: "ana", displayName: "Ana", password: "ana-secret", role: "member", teamIds: ["beta"] }, admin);
    const bobKey = await postAuth(env.base, "/__molenkopf/keys", { owner: "bob", project: "project-one", teamId: "alpha" }, admin).then((res) => res.json());
    const anaKey = await postAuth(env.base, "/__molenkopf/keys", { owner: "ana", project: "project-two", teamId: "beta" }, admin).then((res) => res.json());
    await fetch(`${env.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${bobKey.secret}` }, body: "{}" });
    await fetch(`${env.base}/v1/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${anaKey.secret}` }, body: "{}" });

    const bob = cookieFrom(await post(env.base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    const response = await getAuth(env.base, "/__molenkopf/plugins/context-compressor-plugin/data", bob);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.plugin.id, "context-compressor-plugin");
    assert.equal(payload.metrics.projects.some((item: { id: string }) => item.id === "project-one"), true);
    assert.equal(payload.metrics.projects.some((item: { id: string }) => item.id === "project-two"), false);
  } finally {
    await env.close();
  }
});

test("member plugin data follows specific team policy over default everyone", async () => {
  const env = await startPolicyProxy("molenkopf-plugin-data-team-policy-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", { id: "bob", displayName: "Bob", password: "bob-secret", role: "member", teamIds: ["alpha"] }, admin);
    await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", {
      pluginPolicies: { "context-compressor-plugin": { capabilities: ["settings:read"] } }
    }, admin);

    const bob = cookieFrom(await post(env.base, "/__molenkopf/login", { username: "bob", password: "bob-secret" }));
    const response = await getAuth(env.base, "/__molenkopf/plugins/context-compressor-plugin/data", bob);
    assert.equal(response.status, 403);
  } finally {
    await env.close();
  }
});
