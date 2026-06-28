import type { ServerResponse } from "node:http";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { executeCliProvider } from "../runtime/cli-executor.ts";
import { cliRequest } from "../runtime/cli-request.ts";
import { isOpenAiResponses, wantsStream } from "../runtime/cli-provider.ts";
import { anthropicStep, anthropicStreamDone, anthropicStreamStart, anthropicTextDelta, openAiProgress, openAiStep, openAiStreamDone, openAiStreamStart, openAiTextDelta, streamError } from "./cli-sse-format.ts";

const CLI_STREAM_PROGRESS_INTERVAL_MS = 2000;

export type CliStreamResult = {
  status: number;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export function canStreamCli(path: string, body: string): boolean {
  return wantsStream(body) && (isOpenAiResponses(path) || isAnthropicMessages(path));
}

export async function streamCliProvider(
  provider: ProviderConfig,
  body: string,
  requestId: string,
  path: string,
  res: ServerResponse
): Promise<CliStreamResult> {
  return isAnthropicMessages(path)
    ? streamAnthropicCliProvider(provider, body, requestId, res)
    : streamOpenAiCliProvider(provider, body, requestId, res);
}

async function streamOpenAiCliProvider(provider: ProviderConfig, body: string, requestId: string, res: ServerResponse): Promise<CliStreamResult> {
  const request = cliRequest(body, provider);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  res.write(openAiStreamStart(requestId, request.responseModel));
  const keepAlive = setInterval(() => res.write(openAiProgress(requestId, request.responseModel)), CLI_STREAM_PROGRESS_INTERVAL_MS);
  keepAlive.unref?.();
  const abort = new AbortController();
  let clientClosed = false;
  const onClose = () => { clientClosed = true; abort.abort(); };
  res.once("close", onClose);
  let streamedText = "";
  try {
    const output = await executeCliProvider(provider, request.prompt, request.runModel, {
      signal: abort.signal,
      onEvent: (event) => {
        if (clientClosed || res.destroyed) return;
        if (event.kind === "text_delta") { streamedText += event.text; res.write(openAiTextDelta(requestId, event.text)); }
        else res.write(openAiStep(requestId, request.responseModel, event.label));
      }
    });
    const usage = { inputTokens: estimateTokens(request.prompt), outputTokens: estimateTokens(output) };
    if (!streamedText && output) res.write(openAiTextDelta(requestId, output));
    res.end(openAiStreamDone(requestId, request.responseModel, output, usage));
    return { status: 200, usage };
  } catch {
    if (!clientClosed && !res.destroyed) {
      const output = streamedText || "Local CLI provider failed before producing a complete response.";
      if (!streamedText) res.write(openAiTextDelta(requestId, output));
      const usage = { inputTokens: estimateTokens(request.prompt), outputTokens: estimateTokens(output) };
      res.end(openAiStreamDone(requestId, request.responseModel, output, usage));
    }
    return { status: 502 };
  } finally {
    clearInterval(keepAlive);
    res.off("close", onClose);
  }
}

async function streamAnthropicCliProvider(provider: ProviderConfig, body: string, requestId: string, res: ServerResponse): Promise<CliStreamResult> {
  const request = cliRequest(body, provider);
  const inputTokens = estimateTokens(request.prompt);
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(anthropicStreamStart(requestId, request.responseModel, { inputTokens }));
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), CLI_STREAM_PROGRESS_INTERVAL_MS);
  keepAlive.unref?.();
  const abort = new AbortController();
  let clientClosed = false, streamedText = "";
  const onClose = () => { clientClosed = true; abort.abort(); };
  res.once("close", onClose);
  try {
    const output = await executeCliProvider(provider, request.prompt, request.runModel, {
      signal: abort.signal,
      onEvent: (event) => {
        if (clientClosed || res.destroyed) return;
        if (event.kind === "text_delta") { streamedText += event.text; res.write(anthropicTextDelta(event.text)); }
        else res.write(anthropicStep(event.label));
      }
    });
    const usage = { inputTokens, outputTokens: estimateTokens(output) };
    if (!streamedText && output) res.write(anthropicTextDelta(output));
    res.end(anthropicStreamDone(usage));
    return { status: 200, usage };
  } catch {
    if (!clientClosed && !res.destroyed) res.end(streamError());
    return { status: 502 };
  } finally {
    clearInterval(keepAlive);
    res.off("close", onClose);
  }
}

function isAnthropicMessages(path: string): boolean {
  return path.split("?")[0] === "/v1/messages";
}
