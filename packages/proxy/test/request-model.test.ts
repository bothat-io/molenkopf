import test from "node:test";
import assert from "node:assert/strict";
import { requestModelMetadataFromBody } from "../src/http/request-model.ts";
import type { ProviderConfig } from "../../core/src/providers/provider-catalog.ts";

const codexProvider: ProviderConfig = {
  id: "codex",
  name: "Codex",
  kind: "cli",
  target: "cli://codex",
  runtime: "codex",
  runtimeProfile: { model: "gpt-5.5", modelReasoningEffort: "xhigh" }
};

test("request model metadata falls back to Codex profile thinking", () => {
  assert.deepEqual(requestModelMetadataFromBody(JSON.stringify({ input: "hello" }), codexProvider), {
    model: "gpt-5.5",
    reasoning: "xhigh"
  });
});

test("request model metadata keeps explicit request reasoning", () => {
  assert.deepEqual(requestModelMetadataFromBody(JSON.stringify({ model: "gpt-5-mini", reasoning: { effort: "low" } }), codexProvider), {
    model: "gpt-5-mini",
    reasoning: "low"
  });
});
