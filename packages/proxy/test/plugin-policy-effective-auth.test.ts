import test from "node:test";
import assert from "node:assert/strict";
import { getAuth, post, postAuth, setupAdmin, startPolicyProxy } from "./plugin-policy-api-test-utils.ts";

test("effective plugin policy endpoints require admin access", async () => {
  const env = await startPolicyProxy("molenkopf-policy-effective-auth-");
  try {
    const admin = await setupAdmin(env.base);
    await postAuth(env.base, "/__molenkopf/identity/teams", { id: "alpha", name: "Alpha" }, admin);
    await postAuth(env.base, "/__molenkopf/identity/users", {
      id: "bob",
      displayName: "Bob",
      password: "bob-secret",
      role: "member",
      teamIds: ["alpha"]
    }, admin);
    const bob = await login(env.base, "bob", "bob-secret");

    assert.equal((await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha", bob)).status, 403);
    assert.equal((await getAuth(env.base, "/__molenkopf/plugin-policies/effective/other/context-compressor-plugin", bob)).status, 403);
    assert.equal((await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha", admin)).status, 200);
    assert.equal((await getAuth(env.base, "/__molenkopf/plugin-policies/effective/alpha/context-compressor-plugin", admin)).status, 200);
  } finally {
    await env.close();
  }
});

async function login(base: string, username: string, password: string): Promise<string> {
  return (await post(base, "/__molenkopf/login", { username, password })).headers.get("set-cookie")?.split(";")[0] ?? "";
}
