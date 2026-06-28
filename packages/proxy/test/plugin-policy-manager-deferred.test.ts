import test from "node:test";
import assert from "node:assert/strict";
import { cookieFrom, post, postAuth, putAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("manager role is deferred and cannot read or write MVP policy endpoints", async () => {
  const env = await startPolicyProxy("molenkopf-policy-manager-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", {
      id: "mona",
      displayName: "Mona",
      password: "mona-secret",
      role: "manager",
      teamIds: ["alpha"]
    }, admin);
    await postAuth(env.base, "/__molenkopf/identity/teams", {
      id: "alpha",
      name: "Alpha",
      managerIds: ["mona"]
    }, admin);

    const manager = cookieFrom(await post(env.base, "/__molenkopf/login", { username: "mona", password: "mona-secret" }));
    const globalRead = await fetch(`${env.base}/__molenkopf/plugin-policies/global`, { headers: { cookie: manager } });
    const teamWrite = await putAuth(env.base, "/__molenkopf/plugin-policies/teams/alpha", { pluginPolicies: {} }, manager);
    assert.equal(globalRead.status, 403);
    assert.equal(teamWrite.status, 403);
  } finally {
    await env.close();
  }
});
