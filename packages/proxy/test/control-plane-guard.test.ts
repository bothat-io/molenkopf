import test from "node:test";
import assert from "node:assert/strict";
import { checkControlPlaneWrite } from "../src/http/control-plane-guard.ts";

test("public bind cookie writes require an Origin header", () => {
  const req: any = {
    method: "POST",
    headers: { host: "example.test", cookie: "molenkopf_session=signed", "content-type": "application/json" }
  };
  assert.deepEqual(checkControlPlaneWrite(req, "/__molenkopf/routing/mode", { host: "0.0.0.0" } as any), { ok: false, status: 403, error: "bad_origin" });
  assert.deepEqual(checkControlPlaneWrite(req, "/__molenkopf/routing/mode", { host: "127.0.0.1" } as any), { ok: true });
});
