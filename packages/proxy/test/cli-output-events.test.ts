import test from "node:test";
import assert from "node:assert/strict";
import { createCliOutputCollector, type CliOutputEvent } from "../src/runtime/cli-output-events.ts";

test("CLI output collector reads turn completed usage", () => {
  const events: CliOutputEvent[] = [];
  const collector = createCliOutputCollector((event) => events.push(event));
  collector.feed(Buffer.from(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 11, output_tokens: 4 }, result: "done" }) + "\n"));
  assert.equal(collector.finish(""), "done");
  assert.deepEqual(collector.usage, { inputTokens: 11, outputTokens: 4, source: "cli_event" });
  assert.deepEqual(events, [{ kind: "text_delta", text: "done" }]);
});

test("CLI output collector reads usage from final result object", () => {
  const collector = createCliOutputCollector();
  collector.feed(Buffer.from(JSON.stringify({ type: "result", result: { output_text: "ok", usage: { input_tokens: 20, output_tokens: 5 } } }) + "\n"));
  assert.equal(collector.finish(""), "ok");
  assert.deepEqual(collector.usage, { inputTokens: 20, outputTokens: 5, source: "cli_event" });
});

test("CLI output collector does not emit usage events", () => {
  const events: CliOutputEvent[] = [];
  const collector = createCliOutputCollector((event) => events.push(event));
  collector.feed(Buffer.from(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }) + "\n"));
  collector.finish("");
  assert.deepEqual(events, []);
});
