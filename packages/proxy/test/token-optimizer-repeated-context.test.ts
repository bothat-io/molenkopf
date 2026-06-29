import test from "node:test";
import assert from "node:assert/strict";
import { detectRepeatedContext } from "../../plugins/token-optimizer-plugin/repeated-context.ts";

test("token optimizer reports only low-confidence repeated token pressure without fingerprints", () => {
  const findings = detectRepeatedContext([
    manifest("project-alpha", "POST", "/v1/responses", 350),
    manifest("project-alpha", "POST", "/v1/responses", 360),
    manifest("project-alpha", "POST", "/v1/responses", 370),
    manifest("project-beta", "POST", "/v1/responses", 30)
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].project, "project-alpha");
  assert.equal(findings[0].repeatedInputTokens, 1080);
  assert.equal(findings[0].confidence, "low");
  assert.equal(findings[0].reason, "content_fingerprints_unavailable");
});

test("token optimizer avoids repeated-context claims for two small endpoint hits", () => {
  const findings = detectRepeatedContext([
    manifest("project-alpha", "POST", "/v1/responses", 400),
    manifest("project-alpha", "POST", "/v1/responses", 400)
  ]);
  assert.deepEqual(findings, []);
});

test("token optimizer reports high confidence for repeated content fingerprints", () => {
  const hash = "a".repeat(64);
  const findings = detectRepeatedContext([
    { ...manifest("project-alpha", "POST", "/v1/responses", 100), contentFingerprints: [fingerprint(hash)] },
    { ...manifest("project-alpha", "POST", "/v1/responses", 120), contentFingerprints: [fingerprint(hash)] }
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].confidence, "high");
  assert.equal(findings[0].reason, "matching_content_fingerprint");
  assert.equal(findings[0].requests, 2);
  assert.equal(findings[0].repeatedInputTokens, 500);
});

test("token optimizer reports high confidence for repeated retrieval ids", () => {
  const findings = detectRepeatedContext([
    { ...manifest("project-alpha", "POST", "/v1/responses", 100), retrievalIds: ["molenkopf://sha256/repeated"], estimatedOriginalTokens: 800 },
    { ...manifest("project-alpha", "POST", "/v1/responses", 120), retrievalIds: ["molenkopf://sha256/repeated"], estimatedOriginalTokens: 850 }
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].confidence, "high");
  assert.equal(findings[0].reason, "matching_retrieval_id");
  assert.equal(findings[0].repeatedInputTokens, 1650);
});

function manifest(project: string, method: string, path: string, inputTokens: number) {
  return { client: { project }, method, path, upstreamInputTokens: inputTokens } as any;
}

function fingerprint(hash: string) {
  return { hash, contentKind: "log", originalBytes: 2000, estimatedOriginalTokens: 250, compressed: false, skipReason: "observe_only" };
}
