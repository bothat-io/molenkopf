import type { UsageTotals } from "../../../core/src/manifest/usage-meter.ts";
import { estimateTokens } from "../../../core/src/utils/tokens.ts";

export function mergedCliUsage(prompt: string, output: string, usage: UsageTotals | undefined): UsageTotals {
  const inputEstimated = usage?.inputTokens === undefined;
  const outputEstimated = usage?.outputTokens === undefined;
  const inputTokens = usage?.inputTokens ?? estimateTokens(prompt);
  const outputTokens = usage?.outputTokens ?? estimateTokens(output);
  return {
    ...usage,
    inputTokens,
    outputTokens,
    source: usage ? (inputEstimated || outputEstimated ? "mixed_cli_event_estimate" : "cli_event") : "estimated_cli"
  };
}
