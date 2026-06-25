import test from "node:test";
import assert from "node:assert/strict";
import { createCiAuditArtifact, packPrContext } from "../src/ci/ci-mode.ts";

test("packs PR context without remote issue calls and creates redacted audit artifact", () => {
  const context = packPrContext({
    title: "Fix parser token=title-secret",
    description: "Uses password=description-secret",
    files: [{ path: "src/token=path-secret/app.ts", patch: "+const api_key=secret\n+console.log(1)" }]
  });
  assert.match(context, /Fix parser/);
  assert.doesNotMatch(context, /title-secret|description-secret|path-secret|api_key=secret/);
  assert.match(context, /REDACTED_SECRET/);
  const artifact = createCiAuditArtifact({ requestId: "req", savedTokens: 12, retrievalIds: ["molenkopf://sha256/abc"] });
  assert.equal(artifact.mode, "ci");
  assert.equal(artifact.remoteIssueIntegration, false);
});

test("bounds PR context fields, patches, and total output with omission markers", () => {
  const context = packPrContext({
    title: "t".repeat(20),
    description: "d".repeat(20),
    files: [
      { path: "../src/a.ts", patch: "+".repeat(30) },
      { path: "src/b.ts", patch: "+".repeat(30) }
    ]
  }, { maxFieldChars: 8, maxPatchChars: 10, maxTotalChars: 200 });
  assert.match(context, /molenkopf omitted: 12 field chars/);
  assert.match(context, /molenkopf omitted: 20 patch chars/);
  assert.match(context, /molenkopf omitted: 1 files after total context limit/);
  assert.doesNotMatch(context, /\.\./);
});

test("rejects pathological PR file counts", () => {
  assert.throws(() => packPrContext({
    title: "many files",
    files: [{ path: "a.ts", patch: "" }, { path: "b.ts", patch: "" }]
  }, { maxFiles: 1 }), /too_many_pr_files/);
});
