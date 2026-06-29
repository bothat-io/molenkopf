import test from "node:test";
import assert from "node:assert/strict";
import { RequestTimer } from "../src/observability/request-timing.ts";

test("RequestTimer reports bounded stage durations without payload data", () => {
  let now = 100;
  const timer = new RequestTimer(() => now);
  now = 125;
  timer.mark("auth:end");
  now = 180;
  timer.mark("upstream:first-byte");
  now = 210;

  assert.deepEqual(timer.snapshot(), {
    firstByteMs: 80,
    totalMs: 110
  });
});

test("RequestTimer reports known stage pairs", () => {
  let now = 10;
  const timer = new RequestTimer(() => now);
  timer.mark("compression:start");
  now = 45;
  timer.mark("compression:end");
  assert.equal(timer.snapshot().compressionMs, 35);
});
