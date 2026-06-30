import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { readBody } from "../src/http/server-io.ts";

test("request body read rejects on idle timeout abort and size limit", async () => {
  const idle = new PassThrough() as any;
  idle.complete = false;
  const timedOut = readBody(idle, 20);
  idle.write("partial");
  await assert.rejects(timedOut, /request body timed out after 20ms/);
  assertBodyListenerCounts(idle);

  const aborted = new PassThrough() as any;
  aborted.complete = false;
  const abortedRead = readBody(aborted, 1000);
  aborted.emit("aborted");
  await assert.rejects(abortedRead, /request body aborted/);
  assertBodyListenerCounts(aborted);

  const tooLarge = new PassThrough() as any;
  tooLarge.complete = true;
  const limited = readBody(tooLarge, 1000, 4);
  tooLarge.end("12345");
  await assert.rejects(limited, /request_body_too_large/);
  assertBodyListenerCounts(tooLarge);
});

test("request body read removes listeners after success and premature close", async () => {
  const ok = new PassThrough() as any;
  ok.complete = true;
  const read = readBody(ok, 1000);
  ok.end("hello");
  assert.equal(await read, "hello");
  assertBodyListenerCounts(ok);

  const closed = new PassThrough() as any;
  closed.complete = false;
  const closedRead = readBody(closed, 1000);
  closed.emit("close");
  await assert.rejects(closedRead, /request body aborted/);
  assertBodyListenerCounts(closed);
});

function assertBodyListenerCounts(stream: PassThrough): void {
  for (const event of ["data", "aborted", "close", "error", "end"]) assert.equal(stream.listenerCount(event), 0, `${event} listener leaked`);
}
