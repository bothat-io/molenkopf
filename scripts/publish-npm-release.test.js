import test from "node:test";
import assert from "node:assert/strict";
import { localMainSyncFailures, npmPublishArgs, parsePublishArgs, publishPackageFailures, releaseRunSucceeded, repoFullName } from "./publish-npm-release.js";

test("parsePublishArgs defaults to the current package version tag", () => {
  assert.deepEqual(parsePublishArgs([], "0.1.2"), { tag: "v0.1.2", version: "0.1.2", dryRun: false, skipGithubCheck: false });
});

test("parsePublishArgs accepts explicit tag and dry run", () => {
  assert.deepEqual(parsePublishArgs(["--tag", "v1.2.3", "--dry-run"], "0.1.2"), { tag: "v1.2.3", version: "1.2.3", dryRun: true, skipGithubCheck: false });
});

test("parsePublishArgs rejects invalid tags", () => {
  assert.throws(() => parsePublishArgs(["--tag", "latest"], "0.1.2"), /SemVer tag/);
});

test("publishPackageFailures requires the scoped public package contract", () => {
  assert.deepEqual(publishPackageFailures({ name: "@bothat-io/molenkopf", version: "0.1.2", private: false, publishConfig: { access: "public" } }, "v0.1.2"), []);
  const failures = publishPackageFailures({ name: "molenkopf", version: "0.1.1", private: true, publishConfig: {} }, "v0.1.2").join("\n");
  assert.match(failures, /@bothat-io\/molenkopf/);
  assert.match(failures, /private/);
  assert.match(failures, /public/);
  assert.match(failures, /v0\.1\.2/);
});

test("releaseRunSucceeded requires the exact successful tag run", () => {
  const runs = [{ name: "release", event: "push", head_branch: "v0.1.2", head_sha: "abc", status: "completed", conclusion: "success" }];
  assert.equal(releaseRunSucceeded(runs, "v0.1.2", "abc"), true);
  assert.equal(releaseRunSucceeded(runs, "v0.1.3", "abc"), false);
  assert.equal(releaseRunSucceeded([{ ...runs[0], conclusion: "failure" }], "v0.1.2", "abc"), false);
});

test("localMainSyncFailures requires local main to match origin/main", () => {
  assert.deepEqual(localMainSyncFailures({ localMain: "abc", originMain: "abc" }), []);
  assert.match(localMainSyncFailures({ localMain: "abc", originMain: "def" }).join("\n"), /local main must match origin\/main/);
  assert.match(localMainSyncFailures({ localMain: "", originMain: "def" }).join("\n"), /local main branch is missing/);
  assert.match(localMainSyncFailures({ localMain: "abc", originMain: "" }).join("\n"), /origin\/main is missing/);
});

test("repoFullName parses GitHub origin URLs", () => {
  assert.equal(repoFullName("https://github.com/bothat-io/molenkopf.git"), "bothat-io/molenkopf");
  assert.equal(repoFullName("git@github.com:bothat-io/molenkopf.git"), "bothat-io/molenkopf");
});

test("npmPublishArgs keeps npm publish explicit and public", () => {
  assert.deepEqual(npmPublishArgs(false), ["publish", "--access", "public"]);
  assert.deepEqual(npmPublishArgs(true), ["publish", "--access", "public", "--dry-run"]);
});
