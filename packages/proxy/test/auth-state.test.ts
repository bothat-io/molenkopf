import test from "node:test";
import assert from "node:assert/strict";
import { providerAllowed, type AuthUser } from "../src/http/auth-state.ts";

test("providerAllowed enforces team provider restrictions", () => {
  const teams: Record<string, any> = { limited: { id: "limited", allowedProviders: ["openai"] }, everyone: { id: "everyone", allowedProviders: "*" } };
  const state: any = { identity: { getTeam: (id: string) => teams[id] } };
  const member: AuthUser = { id: "m", displayName: "m", role: "member", teamIds: ["limited"], createdAt: "x" };
  const admin: AuthUser = { id: "a", displayName: "a", role: "admin", teamIds: ["everyone"], createdAt: "x" };
  assert.equal(providerAllowed(state, member, "openai"), true);
  assert.equal(providerAllowed(state, member, "anthropic"), false);
  assert.equal(providerAllowed(state, admin, "anthropic"), true);
  assert.equal(providerAllowed(state, undefined, "anthropic"), true, "open mode allows all");
});
