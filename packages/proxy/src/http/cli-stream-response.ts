import type { ServerResponse } from "node:http";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import type { UsageTotals } from "../../../core/src/manifest/usage-meter.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { executeCliProvider } from "../runtime/cli-executor.ts";
import { cliRequest } from "../runtime/cli-request.ts";
import { isOpenAiResponses, wantsStream } from "../runtime/cli-provider.ts";
import type { CliOutputEvent } from "../runtime/cli-output-events.ts";
import { mergedCliUsage } from "../runtime/cli-usage.ts";
import { visibleCliStepLabel } from "./cli-progress-label.ts";
import { anthropicStep, anthropicStreamDone, anthropicStreamStart, anthropicTextDelta, openAiMessageStart, openAiProgress, openAiStep, openAiStreamDone, openAiStreamStart, openAiTextDelta, streamError, type OpenAiStreamState } from "./cli-sse-format.ts";
import { endSse, writeSse, writeSseHeaders } from "./cli-sse-writer.ts";

const CLI_STREAM_PROGRESS_INTERVAL_MS = 2000;

export type CliStreamResult = {
  status: number;
  usage?: UsageTotals;
};
export type CliStreamOptions = { onEvent?: (event: CliOutputEvent) => void };

export function canStreamCli(path: string, body: string): boolean {
  return wantsStream(body) && (isOpenAiResponses(path) || isAnthropicMessages(path));
}

export async function streamCliProvider(
  provider: ProviderConfig,
  body: string,
  requestId: string,
  path: string,
  res: ServerResponse,
  options: CliStreamOptions = {}
): Promise<CliStreamResult> {
  return isAnthropicMessages(path)
    ? streamAnthropicCliProvider(provider, body, requestId, res, options)
    : streamOpenAiCliProvider(provider, body, requestId, res, options);
}

async function streamOpenAiCliProvider(provider: ProviderConfig, body: string, requestId: string, res: ServerResponse, options: CliStreamOptions): Promise<CliStreamResult> {
  const request = cliRequest(body, provider);
  writeSseHeaders(res);
  writeSse(res, openAiStreamStart(requestId, request.responseModel));
  const streamState: OpenAiStreamState = { reasoningParts: [], messageStarted: false };
  const keepAlive = setInterval(() => writeSse(res, openAiProgress(requestId, request.responseModel)), CLI_STREAM_PROGRESS_INTERVAL_MS);
  keepAlive.unref?.();
  const abort = new AbortController();
  let clientClosed = false;
  const onClose = () => { clientClosed = true; abort.abort(); };
  res.once("close", onClose);
  let streamedText = "";
  try {
    const cli = await executeCliProvider(provider, request.prompt, request.runModel, {
      signal: abort.signal,
      onEvent: (event) => {
        options.onEvent?.(event);
        if (clientClosed || res.destroyed) return;
        if (event.kind === "text_delta") { streamedText += event.text; writeSse(res, openAiMessageStart(requestId, streamState) + openAiTextDelta(requestId, streamState, event.text)); }
        else {
          const label = visibleCliStepLabel(event.label);
          if (label) writeSse(res, openAiStep(requestId, streamState, label));
        }
      }
    });
    const output = cli.output;
    const usage = mergedCliUsage(request.prompt, output, cli.usage);
    if (!streamedText && output) writeSse(res, openAiMessageStart(requestId, streamState) + openAiTextDelta(requestId, streamState, output));
    endSse(res, openAiStreamDone(requestId, request.responseModel, output, usage, streamState));
    return { status: 200, usage };
  } catch {
    if (!clientClosed && !res.destroyed) {
      const output = streamedText || "Local CLI provider failed before producing a complete response.";
      if (!streamedText) writeSse(res, openAiMessageStart(requestId, streamState) + openAiTextDelta(requestId, streamState, output));
      const usage = { inputTokens: estimateTokens(request.prompt), outputTokens: estimateTokens(output) };
      endSse(res, openAiStreamDone(requestId, request.responseModel, output, usage, streamState));
    }
    return { status: 502 };
  } finally {
    clearInterval(keepAlive);
    res.off("close", onClose);
  }
}

async function streamAnthropicCliProvider(provider: ProviderConfig, body: string, requestId: string, res: ServerResponse, options: CliStreamOptions): Promise<CliStreamResult> {
  const request = cliRequest(body, provider);
  const inputTokens = estimateTokens(request.prompt);
  writeSseHeaders(res);
  writeSse(res, anthropicStreamStart(requestId, request.responseModel, { inputTokens }));
  const keepAlive = setInterval(() => writeSse(res, ": keep-alive\n\n"), CLI_STREAM_PROGRESS_INTERVAL_MS);
  keepAlive.unref?.();
  const abort = new AbortController();
  let clientClosed = false, streamedText = "";
  const onClose = () => { clientClosed = true; abort.abort(); };
  res.once("close", onClose);
  try {
    const cli = await executeCliProvider(provider, request.prompt, request.runModel, {
      signal: abort.signal,
      onEvent: (event) => {
        options.onEvent?.(event);
        if (clientClosed || res.destroyed) return;
        if (event.kind === "text_delta") { streamedText += event.text; writeSse(res, anthropicTextDelta(event.text)); }
        else {
          const label = visibleCliStepLabel(event.label);
          if (label) writeSse(res, anthropicStep(label));
        }
      }
    });
    const output = cli.output;
    const usage = mergedCliUsage(request.prompt, output, cli.usage);
    if (!streamedText && output) writeSse(res, anthropicTextDelta(output));
    endSse(res, anthropicStreamDone(usage));
    return { status: 200, usage };
  } catch {
    if (!clientClosed && !res.destroyed) endSse(res, streamError());
    return { status: 502 };
  } finally {
    clearInterval(keepAlive);
    res.off("close", onClose);
  }
}

function isAnthropicMessages(path: string): boolean {
  return cleanPath(path) === "/v1/messages";
}

function cleanPath(path: string): string {
  return path.split("?")[0] || "/";
}
