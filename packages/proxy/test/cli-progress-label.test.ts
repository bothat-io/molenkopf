import test from "node:test";
import assert from "node:assert/strict";
import { visibleCliStepLabel } from "../src/http/cli-progress-label.ts";

test("formats CLI progress labels for visible status updates", () => {
  assert.equal(visibleCliStepLabel("turn.started"), undefined);
  assert.equal(visibleCliStepLabel("command_execution completed"), undefined);
  assert.equal(visibleCliStepLabel("command_execution in_progress"), "running command");
  assert.equal(visibleCliStepLabel("command_execution in_progress - npm test --token raw"), "running command - npm");
  assert.equal(visibleCliStepLabel("todo_list"), "updating task list");
  assert.equal(visibleCliStepLabel("tool_use: Bash"), "using Bash");
});
