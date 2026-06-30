import test from "node:test";
import assert from "node:assert/strict";
import { createUsageMeter, usageFromObject } from "../src/manifest/usage-meter.ts";

test("reads Anthropic input/output tokens from a non-streamed body", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { input_tokens: 1200, output_tokens: 340 } })));
  assert.deepEqual(meter.result(), { inputTokens: 1200, outputTokens: 340, source: "provider_response" });
});

test("reads OpenAI prompt/completion tokens", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { prompt_tokens: 88, completion_tokens: 12, total_tokens: 100 } })));
  assert.deepEqual(meter.result(), { inputTokens: 88, outputTokens: 12, source: "provider_response" });
});

test("reads OpenAI cached and reasoning token details", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: {
    prompt_tokens: 1000,
    completion_tokens: 120,
    prompt_tokens_details: { cached_tokens: 768 },
    completion_tokens_details: { reasoning_tokens: 64 }
  } })));
  assert.deepEqual(meter.result(), { inputTokens: 1000, outputTokens: 120, cachedTokens: 768, reasoningTokens: 64, source: "provider_response" });
});

test("reads OpenAI Responses cached and reasoning token details", () => {
  assert.deepEqual(usageFromObject({
    input_tokens: 321,
    output_tokens: 45,
    input_tokens_details: { cached_tokens: 123 },
    output_tokens_details: { reasoning_tokens: 17 }
  }), { inputTokens: 321, outputTokens: 45, cachedTokens: 123, reasoningTokens: 17, source: "provider_response" });
});

test("reads Codex cached and reasoning token fields", () => {
  assert.deepEqual(usageFromObject({
    input_tokens: 400,
    output_tokens: 50,
    cached_input_tokens: 300,
    reasoning_output_tokens: 22
  }), { inputTokens: 400, outputTokens: 50, cachedTokens: 300, reasoningTokens: 22, source: "provider_response" });
});

test("reads Anthropic cache read and cache creation tokens", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { input_tokens: 900, output_tokens: 80, cache_read_input_tokens: 700, cache_creation_input_tokens: 100 } })));
  assert.deepEqual(meter.result(), { inputTokens: 900, outputTokens: 80, cacheReadTokens: 700, cacheCreationTokens: 100, source: "provider_response" });
});

test("reads OpenAI cached and reasoning token details", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: {
    prompt_tokens: 1000,
    completion_tokens: 120,
    prompt_tokens_details: { cached_tokens: 768 },
    completion_tokens_details: { reasoning_tokens: 64 }
  } })));
  assert.deepEqual(meter.result(), { inputTokens: 1000, outputTokens: 120, cachedTokens: 768, reasoningTokens: 64 });
});

test("reads Anthropic cache read and cache creation tokens", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from(JSON.stringify({ usage: { input_tokens: 900, output_tokens: 80, cache_read_input_tokens: 700, cache_creation_input_tokens: 100 } })));
  assert.deepEqual(meter.result(), { inputTokens: 900, outputTokens: 80, cacheReadTokens: 700, cacheCreationTokens: 100 });
});

test("keeps the cumulative maximum across streamed SSE chunks", () => {
  const meter = createUsageMeter();
  meter.feed(Buffer.from('event: message_start\ndata: {"message":{"usage":{"input_tokens":500,"output_tokens":1}}}\n\n'));
  meter.feed(Buffer.from('event: message_delta\ndata: {"usage":{"output_tokens":42}}\n\n'));
  meter.feed(Buffer.from('event: message_delta\ndata: {"usage":{"output_tokens":77}}\n\n'));
  assert.deepEqual(meter.result(), { inputTokens: 500, outputTokens: 77, source: "provider_response" });
});

test("handles SSE chunk boundaries and DONE markers", () => {
  const meter = createUsageMeter();
  meter.feed('event: message_start\ndata: {"message":{"usage":{"input_tokens":12');
  meter.feed('3,"output_tokens":1}}}\n\n');
  meter.feed("data: [DONE]\n\n");
  assert.deepEqual(meter.result(), { inputTokens: 123, outputTokens: 1, source: "provider_response" });
});

test("reads OpenAI streamed usage objects only from SSE data JSON", () => {
  const meter = createUsageMeter();
  meter.feed('data: {"choices":[{"delta":{"content":"hello"}}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n');
  assert.deepEqual(meter.result(), { inputTokens: 9, outputTokens: 4, source: "provider_response" });
});

test("reads CRLF-delimited OpenAI Responses completed usage", () => {
  const meter = createUsageMeter();
  meter.feed('event: response.completed\r\ndata: {"response":{"usage":{"input_tokens":17,"output_tokens":5}}}\r\n\r\n');
  assert.deepEqual(meter.result(), { inputTokens: 17, outputTokens: 5, source: "provider_response" });
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
