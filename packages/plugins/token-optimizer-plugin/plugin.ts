import type { MolenkopfPluginModule } from "../../core/src/plugins/plugin-api.ts";
import { buildTokenBuckets } from "./buckets.ts";
import { observeTokenTraffic } from "./observations.ts";
import { buildRecommendations } from "./recommendations.ts";
import { detectRepeatedContext } from "./repeated-context.ts";
import { safeUnavailableMetrics } from "./safe-output.ts";
import { summarizeBudgetPressure } from "./budgets.ts";
export { descriptorV2 } from "./descriptor-v2.ts";

export const plugin: MolenkopfPluginModule = {
  getData(ctx) {
    const observations = observeTokenTraffic(ctx.manifests);
    const buckets = buildTokenBuckets(ctx.manifests);
    const repeatedContext = detectRepeatedContext(ctx.manifests);
    const budgets = summarizeBudgetPressure(ctx.manifests);
    const recommendations = buildRecommendations(observations, buckets, repeatedContext, budgets);
    return {
      plugin: ctx.plugin,
      scopes: ctx.scopes,
      observations,
      buckets,
      repeatedContext,
      budgets,
      recommendations,
      ...safeUnavailableMetrics()
    };
  }
};
