import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { executeCliProvider } from "./cli-executor.ts";
import { cliRequest } from "./cli-request.ts";

export type CliProviderResult = {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export function isCliProvider(provider: ProviderConfig): boolean {
  return provider.kind === "cli" && (provider.runtime === "claude" || provider.runtime === "codex");
}

export function isModelListPath(path: string): boolean {
  const clean = path.split("?")[0];
  return clean === "/v1/models" || clean === "/models";
}

export function cliModelList(provider: ProviderConfig): CliProviderResult {
  const ids = [...new Set([provider.id, provider.runtime === "codex" ? "gpt-5" : "sonnet"])];
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify({
      object: "list",
      data: ids.map((id) => ({ id, object: "model", created: 0, owned_by: "molenkopf-cli" }))
    }))
  };
}

export async function runCliProvider(provider: ProviderConfig, body: string, requestId: string, path = "/v1/responses"): Promise<CliProviderResult> {
  const request = cliRequest(body, provider);
  const prompt = request.prompt;
  const output = await executeCliProvider(provider, prompt, request.runModel);
  const usage = { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(output) };
  const model = request.responseModel;
  if (isAnthropicMessages(path) && wantsStream(body)) {
    return {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: Buffer.from(anthropicStream(requestId, model, output, usage)),
      usage
    };
  }
  if (isOpenAiResponses(path) && wantsStream(body)) {
    return {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: Buffer.from(openAiResponsesStream(requestId, model, output, usage)),
      usage
    };
  }
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: Buffer.from(JSON.stringify(responseBody(requestId, model, output, path, usage))),
    usage
  };
}

function responseBody(requestId: string, model: string, text: string, path: string, usage: { inputTokens?: number; outputTokens?: number }) {
  const input = usage.inputTokens ?? 0, output = usage.outputTokens ?? 0;
  if (isAnthropicMessages(path)) {
    return {
      id: `msg_${requestId.replaceAll("-", "")}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: input, output_tokens: output }
    };
  }
  return {
    id: requestId,
    object: "response",
    model,
    output_text: text,
    output: [{
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text }]
    }],
    usage: { input_tokens: input, output_tokens: output, prompt_tokens: input, completion_tokens: output }
  };
}

function isAnthropicMessages(path: string): boolean {
  return path.split("?")[0] === "/v1/messages";
}

export function isOpenAiResponses(path: string): boolean {
  return path.split("?")[0] === "/v1/responses";
}

export function wantsStream(body: string): boolean {
  try {
    const data = JSON.parse(body || "{}") as { stream?: unknown };
    return data.stream === true;
  } catch {
    return false;
  }
}

function anthropicStream(requestId: string, model: string, text: string, usage: { inputTokens?: number; outputTokens?: number }): string {
  const id = `msg_${requestId.replaceAll("-", "")}`;
  const input = usage.inputTokens ?? 0, output = usage.outputTokens ?? 0;
  return [
    sse("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: input, output_tokens: 0 } } }),
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: output } }),
    sse("message_stop", { type: "message_stop" })
  ].join("");
}

function openAiResponsesStream(requestId: string, model: string, text: string, usage: { inputTokens?: number; outputTokens?: number }): string {
  return [
    openAiResponsesStreamStart(requestId, model),
    openAiResponsesStreamOutput(requestId, model, text, usage),
    "data: [DONE]\n\n"
  ].join("");
}

export function openAiResponsesStreamStart(requestId: string, model: string): string {
  const base = { id: requestId, object: "response", model, output: [] };
  return [
    sse("response.created", { type: "response.created", response: { ...base, status: "in_progress" } }),
    sse("response.in_progress", { type: "response.in_progress", response: { ...base, status: "in_progress" } })
  ].join("");
}

export function openAiResponsesStreamOutput(requestId: string, model: string, text: string, usage: { inputTokens?: number; outputTokens?: number }): string {
  const input = usage.inputTokens ?? 0, output = usage.outputTokens ?? 0;
  const itemId = `msg_${requestId.replaceAll("-", "")}`;
  const base = { id: requestId, object: "response", model, output: [] };
  const item = { id: itemId, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] };
  const completed = {
    ...base,
    status: "completed",
    output: [item],
    output_text: text,
    usage: {
      input_tokens: input,
      output_tokens: output,
      total_tokens: input + output,
      prompt_tokens: input,
      completion_tokens: output
    }
  };
  return [
    sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } }),
    sse("response.content_part.added", { type: "response.content_part.added", item_id: itemId, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }),
    sse("response.output_text.delta", { type: "response.output_text.delta", item_id: itemId, output_index: 0, content_index: 0, delta: text }),
    sse("response.output_text.done", { type: "response.output_text.done", item_id: itemId, output_index: 0, content_index: 0, text }),
    sse("response.content_part.done", { type: "response.content_part.done", item_id: itemId, output_index: 0, content_index: 0, part: item.content[0] }),
    sse("response.output_item.done", { type: "response.output_item.done", output_index: 0, item }),
    sse("response.completed", { type: "response.completed", response: completed })
  ].join("");
}

export function openAiResponsesStreamFailure(requestId: string, model: string): string {
  return [
    sse("response.failed", {
      type: "response.failed",
      response: { id: requestId, object: "response", model, status: "failed", error: { code: "proxy_error", message: "Local CLI provider failed." } }
    }),
    "data: [DONE]\n\n"
  ].join("");
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
