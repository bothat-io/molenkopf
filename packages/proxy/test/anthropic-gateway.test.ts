import test from "node:test";
import assert from "node:assert/strict";
import { resolveCliTarget } from "../src/cli/target.ts";

test("supports ANTHROPIC_BASE_URL compatible target resolution", () => {
  const target = resolveCliTarget(new Map(), { ANTHROPIC_BASE_URL: "http://127.0.0.1:9000" });
  assert.equal(target, "http://127.0.0.1:9000");
});
