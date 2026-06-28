import test from "node:test";
import assert from "node:assert/strict";
import { DEV_WATCH_DIRS, resolveProfile, proxyArgs, devWatchEnabled, cliDevWatchEnabled } from "../src/cli/profile-server.ts";

test("runtime profiles keep dev, test, and prod isolated", () => {
  const dev = resolveProfile("dev", {});
  const testProfile = resolveProfile("test", {});
  const prod = resolveProfile("prod", {});

  assert.equal(dev.port, 8787);
  assert.equal(testProfile.port, 8798);
  assert.equal(prod.port, 8787);
  assert.notEqual(dev.dataDir, testProfile.dataDir);
  assert.notEqual(testProfile.dataDir, prod.dataDir);
  assert.match(prod.dataDir, /[\\\/]\.molenkopf[\\\/]prod$/);
  assert.ok(proxyArgs(testProfile).includes("--data-dir"));
  assert.equal(devWatchEnabled(dev, {}), true);
  assert.equal(devWatchEnabled(testProfile, {}), false);
  assert.equal(devWatchEnabled(dev, { MOLENKOPF_DEV_WATCH: "0" }), false);
  assert.equal(cliDevWatchEnabled(dev, ["node", "profile-server.ts", "dev", "--no-watch"], {}), false);
  assert.ok(DEV_WATCH_DIRS.includes("packages/plugins"));
});

test("runtime profiles reject invalid values before startup", () => {
  assert.throws(() => resolveProfile("prod", { MOLENKOPF_PROD_PORT: "0" }), /invalid profile port/);
  assert.throws(() => resolveProfile("prod", { MOLENKOPF_PROD_HOST: "127.0.0.1/path" }), /invalid profile host/);
  assert.throws(() => resolveProfile("prod", { MOLENKOPF_PROD_TARGET: "file:///tmp/model" }), /invalid profile target/);
  assert.throws(() => resolveProfile("prod", { MOLENKOPF_PROD_DATA_DIR: " " }), /dataDir/);
});

test("runtime profile env overrides are scoped by profile", () => {
  const profile = resolveProfile("test", {
    MOLENKOPF_TEST_PORT: "8899",
    MOLENKOPF_TEST_DATA_DIR: ".molenkopf/custom-test",
    MOLENKOPF_TARGET: "http://127.0.0.1:11434/v1"
  });

  assert.equal(profile.port, 8899);
  assert.match(profile.dataDir, /custom-test$/);
  assert.equal(profile.target, "http://127.0.0.1:11434/v1");
});
