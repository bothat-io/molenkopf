export type CliStreamUsage = { inputTokens?: number; outputTokens?: number };

export function openAiStreamStart(requestId: string, model: string): string {
  const base = { id: requestId, object: "response", model, output: [] };
  return [
    sse("response.created", { type: "response.created", response: { ...base, status: "in_progress" } }),
    sse("response.in_progress", { type: "response.in_progress", response: { ...base, status: "in_progress" } }),
    sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...messageItem(requestId, ""), status: "in_progress", content: [] } }),
    sse("response.content_part.added", { type: "response.content_part.added", item_id: itemId(requestId), output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } })
  ].join("");
}

export function openAiTextDelta(requestId: string, text: string): string {
  return sse("response.output_text.delta", { type: "response.output_text.delta", item_id: itemId(requestId), output_index: 0, content_index: 0, delta: text });
}

export function openAiStep(label: string): string {
  return sse("molenkopf.cli.step", { type: "molenkopf.cli.step", label });
}

export function openAiStreamDone(requestId: string, model: string, text: string, usage: CliStreamUsage): string {
  const input = usage.inputTokens ?? 0, output = usage.outputTokens ?? 0;
  const item = messageItem(requestId, text);
  return [
    sse("response.output_text.done", { type: "response.output_text.done", item_id: item.id, output_index: 0, content_index: 0, text }),
    sse("response.content_part.done", { type: "response.content_part.done", item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] }),
    sse("response.output_item.done", { type: "response.output_item.done", output_index: 0, item }),
    sse("response.completed", {
      type: "response.completed",
      response: { id: requestId, object: "response", model, status: "completed", output: [item], output_text: text, usage: { input_tokens: input, output_tokens: output, total_tokens: input + output, prompt_tokens: input, completion_tokens: output } }
    }),
    "data: [DONE]\n\n"
  ].join("");
}

export function openAiFailure(requestId: string, model: string): string {
  return [
    sse("response.failed", { type: "response.failed", response: { id: requestId, object: "response", model, status: "failed", error: { code: "proxy_error", message: "Local CLI provider failed." } } }),
    "data: [DONE]\n\n"
  ].join("");
}

export function anthropicStreamStart(requestId: string, model: string, usage: CliStreamUsage): string {
  const id = messageId(requestId);
  return [
    sse("message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.inputTokens ?? 0, output_tokens: 0 } } }),
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
  ].join("");
}

export function anthropicTextDelta(text: string): string {
  return sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
}

export function anthropicStep(label: string): string {
  return sse("molenkopf.cli.step", { type: "molenkopf.cli.step", label });
}

export function anthropicStreamDone(usage: CliStreamUsage): string {
  return [
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: usage.outputTokens ?? 0 } }),
    sse("message_stop", { type: "message_stop" })
  ].join("");
}

export function streamError(message = "Local CLI provider failed."): string {
  return sse("error", { type: "error", error: { type: "proxy_error", message } });
}

function messageItem(requestId: string, text: string) {
  return { id: itemId(requestId), type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] };
}

function itemId(requestId: string): string {
  return `msg_${requestId.replaceAll("-", "")}`;
}

function messageId(requestId: string): string {
  return `msg_${requestId.replaceAll("-", "")}`;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
