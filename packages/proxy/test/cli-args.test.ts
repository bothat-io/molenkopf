import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/args.ts";

test("CLI parser accepts inline flag values", () => {
  const args = parseArgs(["proxy", "--target=https://api.example.test/v1", "--port", "8788"]);

  assert.equal(args.command, "proxy");
  assert.equal(args.flags.get("target"), "https://api.example.test/v1");
  assert.equal(args.flags.get("port"), "8788");
});

test("CLI parser keeps values after -- positional", () => {
  const args = parseArgs(["compress-file", "--", "--literal-file-name"]);

  assert.deepEqual(args.values, ["--literal-file-name"]);
});
