import { validateProviderTarget } from "../../../core/src/security/target-policy.ts";

export function resolveCliTarget(flags: Map<string, string | boolean>, env: Record<string, string | undefined> = process.env): string {
  const explicit = flags.get("target");
  if (typeof explicit === "string" && explicit) return validateCliTarget(explicit);
  if (env.ANTHROPIC_BASE_URL) return validateCliTarget(env.ANTHROPIC_BASE_URL);
  if (env.OPENAI_BASE_URL) return validateCliTarget(env.OPENAI_BASE_URL);
  return validateCliTarget("https://api.openai.com/v1");
}

export function validateCliTarget(value: string): string {
  try {
    return validateProviderTarget(value.trim(), { path: "target", allowPrivate: true });
  } catch {
    throw new Error("invalid target");
  }
}
