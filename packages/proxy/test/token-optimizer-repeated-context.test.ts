import test from "node:test";
import assert from "node:assert/strict";
import { detectRepeatedContext } from "../../plugins/token-optimizer-plugin/repeated-context.ts";

test("token optimizer detects repeated context patterns without mutating traffic", () => {
  const findings = detectRepeatedContext([
    manifest("project-alpha", "POST", "/v1/responses", 120),
    manifest("project-alpha", "POST", "/v1/responses", 140),
    manifest("project-beta", "POST", "/v1/responses", 30)
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].project, "project-alpha");
  assert.equal(findings[0].repeatedInputTokens, 260);
});

function manifest(project: string, method: string, path: string, inputTokens: number) {
  return { client: { project }, method, path, upstreamInputTokens: inputTokens } as any;
}
