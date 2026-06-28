import test from "node:test";
import assert from "node:assert/strict";
import { safePluginOutput } from "../src/http/plugin-output-safety.ts";

test("safePluginOutput sanitizes plugin payloads before they leave proxy boundaries", () => {
  const payload = safePluginOutput("fixture", {
    Authorization: "Bearer secret",
    cookie: "sid=secret",
    prompt: "raw prompt",
    nested: { apiKey: "mk_abcdefghijklmnopqrstuvwxyz" },
    public: "ok"
  });
  assert.equal((payload as any).public, "ok");
  assert.doesNotMatch(JSON.stringify(payload), /Bearer secret|sid=secret|raw prompt|mk_abc/);
});
