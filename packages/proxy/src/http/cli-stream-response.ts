import type { ServerResponse } from "node:http";
import type { ProviderConfig } from "../../../core/src/providers/provider-catalog.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";
import { executeCliProvider } from "../runtime/cli-executor.ts";
import { cliRequest } from "../runtime/cli-request.ts";
import {
  isOpenAiResponses,
  openAiResponsesStreamFailure,
  openAiResponsesStreamOutput,
  openAiResponsesStreamStart,
  wantsStream
} from "../runtime/cli-provider.ts";

export type CliStreamResult = {
  status: number;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export function canStreamOpenAiCli(path: string, body: string): boolean {
  return isOpenAiResponses(path) && wantsStream(body);
}

export async function streamOpenAiCliProvider(
  provider: ProviderConfig,
  body: string,
  requestId: string,
  res: ServerResponse
): Promise<CliStreamResult> {
  const request = cliRequest(body, provider);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  res.write(openAiResponsesStreamStart(requestId, request.responseModel));
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 10000);
  keepAlive.unref?.();
  try {
    const output = await executeCliProvider(provider, request.prompt, request.runModel);
    const usage = { inputTokens: estimateTokens(request.prompt), outputTokens: estimateTokens(output) };
    res.write(openAiResponsesStreamOutput(requestId, request.responseModel, output, usage));
    res.end("data: [DONE]\n\n");
    return { status: 200, usage };
  } catch {
    res.write(openAiResponsesStreamFailure(requestId, request.responseModel));
    res.end();
    return { status: 502 };
  } finally {
    clearInterval(keepAlive);
  }
}
