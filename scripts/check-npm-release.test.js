import test from "node:test";
import assert from "node:assert/strict";
import { gitFailures, packageFailures, publishCommand } from "./check-npm-release.js";

test("packageFailures accepts the Molenkopf npm package contract", () => {
  assert.deepEqual(packageFailures({
    name: "@bothat-io/molenkopf",
    version: "0.1.2",
    private: false,
    publishConfig: { access: "public" }
  }), []);
});

test("packageFailures rejects unsafe npm package contracts", () => {
  const failures = packageFailures({
    name: "molenkopf",
    version: "0.1",
    private: true,
    publishConfig: {}
  });
  assert.match(failures.join("\n"), /@bothat-io\/molenkopf/);
  assert.match(failures.join("\n"), /private/);
  assert.match(failures.join("\n"), /SemVer/);
  assert.match(failures.join("\n"), /public/);
});

test("gitFailures requires clean tagged main", () => {
  assert.deepEqual(gitFailures({ branch: "main", status: "", tags: ["v0.1.2"] }, "0.1.2"), []);
  const failures = gitFailures({ branch: "feature", status: " M README.md", tags: [] }, "0.1.2");
  assert.match(failures.join("\n"), /branch main/);
  assert.match(failures.join("\n"), /clean/);
  assert.match(failures.join("\n"), /v0\.1\.2/);
});

test("publishCommand keeps npm publish explicit and public", () => {
  assert.equal(publishCommand(), "npm publish --access public");
});
