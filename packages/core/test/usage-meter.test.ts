import test from "node:test";
import assert from "node:assert/strict";
import { createUsageMeter } from "../src/manifest/usage-meter.ts";

test("reads Anthropic input/output tokens from a non-streamed body", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { input_tokens: 1200, output_tokens: 340 } })));
  assert.deepEqual(meter.result(), { inputTokens: 1200, outputTokens: 340 });
});

test("reads OpenAI prompt/completion tokens", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { prompt_tokens: 88, completion_tokens: 12, total_tokens: 100 } })));
  assert.deepEqual(meter.result(), { inputTokens: 88, outputTokens: 12 });
});

test("keeps the cumulative maximum across streamed SSE chunks", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from('event: message_start\ndata: {"message":{"usage":{"input_tokens":500,"output_tokens":1}}}\n\n'));
  meter.feed(Buffer.from('event: message_delta\ndata: {"usage":{"output_tokens":42}}\n\n'));
  meter.feed(Buffer.from('event: message_delta\ndata: {"usage":{"output_tokens":77}}\n\n'));
  assert.deepEqual(meter.result(), { inputTokens: 500, outputTokens: 77 });
});

test("handles SSE chunk boundaries and DONE markers", () => {
  const meter = createUsageMeter();
  meter.feed('event: message_start\ndata: {"message":{"usage":{"input_tokens":12');
  meter.feed('3,"output_tokens":1}}}\n\n');
  meter.feed("data: [DONE]\n\n");
  assert.deepEqual(meter.result(), { inputTokens: 123, outputTokens: 1 });
});

test("reads OpenAI streamed usage objects only from SSE data JSON", () => {
  const meter = createUsageMeter();
  meter.feed('data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n');
  assert.deepEqual(meter.result(), { inputTokens: 9, outputTokens: 4 });
});

test("reads CRLF-delimited OpenAI Responses completed usage", () => {
  const meter = createUsageMeter();
  meter.feed('event: response.completed\r\ndata: {"response":{"usage":{"input_tokens":17,"output_tokens":5}}}\r\n\r\n');
  assert.deepEqual(meter.result(), { inputTokens: 17, outputTokens: 5 });
});

test("ignores token-looking text outside recognized usage objects", () => {
  const meter = createUsageMeter();
  meter.feed('The model said: "prompt_tokens": 999, "completion_tokens": 888');
  meter.feed(JSON.stringify({ output: [{ content: [{ text: '{"usage":{"prompt_tokens":7,"completion_tokens":8}}' }] }] }));
  assert.deepEqual(meter.result(), { inputTokens: undefined, outputTokens: undefined });
});

test("ignores malformed, negative, fractional, and huge usage values", () => {
  const meter = createUsageMeter();
  meter.feed(JSON.stringify({ usage: { prompt_tokens: -1, completion_tokens: 1.5 } }));
  meter.feed('\n\ndata: {"usage":{"prompt_tokens":9007199254740992,"completion_tokens":1000000001}}\n\n');
  assert.deepEqual(meter.result(), { inputTokens: undefined, outputTokens: undefined });
});

test("returns empty totals when no usage is present", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from('data: {"delta":"hello"}\n\n'));
  assert.deepEqual(meter.result(), { inputTokens: undefined, outputTokens: undefined });
});
