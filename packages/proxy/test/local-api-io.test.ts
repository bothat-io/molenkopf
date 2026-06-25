import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { LocalApiError, readJson, writeJson } from "../src/http/local-api-io.ts";

test("LocalApiError carries status and code", () => {
  const error = new LocalApiError(413, "json_too_large");
  assert.equal(error.status, 413);
  assert.equal(error.code, "json_too_large");
  assert.equal(error.message, "json_too_large");
});

test("readJson accepts valid boundary-sized JSON", async () => {
  const req = streamRequest();
  const result = readJson(req, 7);
  req.end('{"a":1}');
  assert.deepEqual(await result, { a: 1 });
});

test("readJson rejects invalid or non-object JSON", async () => {
  const invalid = streamRequest();
  const invalidResult = readJson(invalid);
  invalid.end("{");
  await assert.rejects(invalidResult, Object.assign(new LocalApiError(400, "invalid_json"), { stack: undefined }));

  const array = streamRequest();
  const arrayResult = readJson(array);
  array.end("[]");
  await assert.rejects(arrayResult, /invalid_json/);
});

test("readJson rejects immediately after the first byte over limit", async () => {
  const req = streamRequest();
  const result = readJson(req, 5);
  req.write('{"a":');
  req.write('"');
  await assert.rejects(result, /json_too_large/);
});

test("writeJson sets hardened response headers", async () => {
  const server = createServer((_req, res) => writeJson(res, 200, { ok: true }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const response = await fetch(`http://127.0.0.1:${(address as AddressInfo).port}/`);
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("expires"), "0");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    server.close();
  }
});

function streamRequest(): IncomingMessage & PassThrough {
  return new PassThrough() as unknown as IncomingMessage & PassThrough;
}
