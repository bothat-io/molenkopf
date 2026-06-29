import test from "node:test";
import assert from "node:assert/strict";
import { hasLongJsonStringCandidate } from "../src/pipeline/json-string-spans.ts";

test("detects only JSON strings that can meet the compression threshold", () => {
  const manyShortStrings = JSON.stringify({
    items: Array.from({ length: 5000 }, (_, i) => `short-${i}`)
  });
  const longString = JSON.stringify({
    output: `${"a".repeat(1200)}\\"${"b".repeat(1200)}`
  });

  assert.equal(hasLongJsonStringCandidate(manyShortStrings, 2000), false);
  assert.equal(hasLongJsonStringCandidate(longString, 2000), true);
});
